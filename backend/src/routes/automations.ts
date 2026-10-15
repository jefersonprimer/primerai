import { and, asc, desc, eq, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { automationRuns, automations, devices, tasks, workspaces } from "../db/schema.js";

const inputSchema = z.object({
  name: z.string().trim().min(1).max(120), prompt: z.string().trim().min(1).max(8_000),
  deviceId: z.string().uuid(), frequency: z.enum(["daily", "weekly"]), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekday: z.number().int().min(0).max(6).nullable().optional(), timezone: z.string().min(1).max(80), enabled: z.boolean().optional(),
}).refine((x) => x.frequency !== "weekly" || x.weekday != null, { message: "weekday é obrigatório para recorrência semanal" });

export function nextOccurrence(from: Date, frequency: "daily" | "weekly", time: string, timezone: string, weekday?: number | null) {
  // Search by UTC minute while matching local wall-clock fields; this handles DST transitions.
  const [hour, minute] = time.split(":").map(Number);
  const cursor = new Date(Math.floor(from.getTime() / 60_000) * 60_000 + 60_000);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (let i = 0; i < 8 * 24 * 60; i++, cursor.setTime(cursor.getTime() + 60_000)) {
    const parts = Object.fromEntries(fmt.formatToParts(cursor).map((p) => [p.type, p.value]));
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday ?? "");
    if (Number(parts.hour) === hour && Number(parts.minute) === minute && (frequency === "daily" || day === weekday)) return new Date(cursor);
  }
  throw new Error("não foi possível calcular a próxima execução");
}

export async function automationRoutes(app: FastifyInstance) {
  const pre = { preHandler: app.authenticate };
  app.get("/v1/automations", pre, async (req) => ({ automations: await app.db.select().from(automations).where(eq(automations.userId, app.requireUser(req).id)).orderBy(asc(automations.nextRunAt)) }));
  app.get<{ Params: { id: string } }>("/v1/automations/:id/runs", pre, async (req, reply) => {
    const userId = app.requireUser(req).id;
    const [rule] = await app.db.select({ id: automations.id }).from(automations).where(and(eq(automations.id, req.params.id), eq(automations.userId, userId))).limit(1);
    if (!rule) return reply.code(404).send({ error: { code: "not_found", message: "automação não encontrada" } });
    return { runs: await app.db.select().from(automationRuns).where(eq(automationRuns.automationId, rule.id)).orderBy(desc(automationRuns.createdAt)).limit(50) };
  });
  app.post("/v1/automations", pre, async (req, reply) => {
    const parsed = inputSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_body", message: parsed.error.message } });
    const userId = app.requireUser(req).id;
    try {
      const data = parsed.data;
      const [device] = await app.db.select().from(devices).where(and(eq(devices.id, data.deviceId), eq(devices.userId, userId))).limit(1);
      if (!device) return reply.code(404).send({ error: { code: "device_not_found", message: "dispositivo não encontrado" } });
      const roots = await app.db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.deviceId, device.id), eq(workspaces.enabled, true)));
      if (!roots.length) return reply.code(409).send({ error: { code: "no_workspaces", message: "Autorize uma pasta no desktop antes de criar a automação." } });
      const [created] = await app.db.insert(automations).values({ ...data, userId, weekday: data.weekday ?? null, nextRunAt: nextOccurrence(new Date(), data.frequency, data.time, data.timezone, data.weekday) }).returning();
      return reply.code(201).send({ automation: created });
    } catch (error) { return reply.code(400).send({ error: { code: "invalid_automation", message: error instanceof Error ? error.message : "configuração inválida" } }); }
  });
  app.patch<{ Params: { id: string } }>("/v1/automations/:id", pre, async (req, reply) => {
    const userId = app.requireUser(req).id;
    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_body", message: parsed.error.message } });
    const [row] = await app.db.update(automations).set({ enabled: parsed.data.enabled, updatedAt: new Date() }).where(and(eq(automations.id, req.params.id), eq(automations.userId, userId))).returning();
    if (!row) return reply.code(404).send({ error: { code: "not_found", message: "automação não encontrada" } });
    return { automation: row };
  });
  app.delete<{ Params: { id: string } }>("/v1/automations/:id", pre, async (req, reply) => {
    const [row] = await app.db.delete(automations).where(and(eq(automations.id, req.params.id), eq(automations.userId, app.requireUser(req).id))).returning({ id: automations.id });
    if (!row) return reply.code(404).send({ error: { code: "not_found", message: "automação não encontrada" } });
    return reply.code(204).send();
  });
  app.post<{ Params: { id: string } }>("/v1/automations/:id/run", pre, async (req, reply) => {
    const userId = app.requireUser(req).id;
    const [rule] = await app.db.select().from(automations).where(and(eq(automations.id, req.params.id), eq(automations.userId, userId))).limit(1);
    if (!rule) return reply.code(404).send({ error: { code: "not_found", message: "automação não encontrada" } });
    const [task] = await app.db.insert(tasks).values({ userId, deviceId: rule.deviceId, prompt: rule.prompt }).returning();
    await app.db.insert(automationRuns).values({ automationId: rule.id, taskId: task!.id, scheduledFor: new Date(), status: "queued" });
    return reply.code(201).send({ task });
  });

  // Atomic due-time claim prevents duplicate runs across backend instances.
  const tick = async () => {
    const due = await app.db.select().from(automations).where(and(eq(automations.enabled, true), lte(automations.nextRunAt, new Date()))).orderBy(asc(automations.nextRunAt)).limit(20);
    for (const rule of due) {
      const scheduledFor = rule.nextRunAt;
      const nextRunAt = nextOccurrence(new Date(), rule.frequency as "daily" | "weekly", rule.time, rule.timezone, rule.weekday);
      const claimed = await app.db.update(automations).set({ nextRunAt, lastRunAt: new Date(), updatedAt: new Date() }).where(and(eq(automations.id, rule.id), eq(automations.nextRunAt, scheduledFor), eq(automations.enabled, true))).returning({ id: automations.id });
      if (!claimed.length) continue;
      await app.db.transaction(async (tx) => {
        const [run] = await tx.insert(automationRuns).values({ automationId: rule.id, scheduledFor, status: "queued" }).onConflictDoNothing().returning({ id: automationRuns.id });
        if (!run) return;
        const [task] = await tx.insert(tasks).values({ userId: rule.userId, deviceId: rule.deviceId, prompt: rule.prompt }).returning({ id: tasks.id });
        await tx.update(automationRuns).set({ taskId: task!.id }).where(eq(automationRuns.id, run.id));
      });
    }
  };
  const timer = setInterval(() => void tick().catch((error) => app.log.error({ error }, "automation worker tick failed")), 30_000);
  timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));
}
