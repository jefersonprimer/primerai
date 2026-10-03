import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CreateTaskSchema } from "@primerai/shared";
import { devices, tasks, workspaces } from "../db/schema.js";

/** REST transport for desktop workers. The desktop remains the only process that touches user files. */
export async function taskRoutes(app: FastifyInstance) {
  const db = app.db;
  const pre = { preHandler: app.authenticate };

  app.get("/v1/devices", pre, async (req) => {
    const rows = await db.select().from(devices).where(eq(devices.userId, app.requireUser(req).id)).orderBy(desc(devices.createdAt));
    return { devices: rows.map((d) => ({ id: d.id, kind: d.kind, name: d.name, platform: d.platform, osVersion: d.osVersion, agentVersion: d.agentVersion, status: d.status === "online" && d.lastSeenAt && Date.now() - d.lastSeenAt.getTime() > 45_000 ? "offline" : d.status, lastSeenAt: d.lastSeenAt?.toISOString() ?? null, createdAt: d.createdAt.toISOString() })) };
  });

  // Desktop registers itself using its signed-in account. Pairing can be layered on without
  // changing task execution: every read/write remains scoped to the owning user and device.
  app.post("/v1/devices", pre, async (req, reply) => {
    const body = req.body as { name?: string; platform?: string };
    if (!body?.name?.trim() || !body.platform?.trim()) return reply.code(400).send({ error: { code: "invalid_body", message: "name e platform são obrigatórios" } });
    const userId = app.requireUser(req).id;
    const name = body.name.trim().slice(0, 120);
    const platform = body.platform.trim().slice(0, 120);
    const [existing] = await db.select().from(devices).where(and(eq(devices.userId, userId), eq(devices.name, name), eq(devices.kind, "desktop"))).limit(1);
    const [device] = existing
      ? await db.update(devices).set({ platform, status: "online", lastSeenAt: new Date() }).where(eq(devices.id, existing.id)).returning()
      : await db.insert(devices).values({ userId, kind: "desktop", name, platform, status: "online", lastSeenAt: new Date() }).returning();
    return reply.code(201).send({ device: { id: device!.id, name: device!.name, platform: device!.platform, status: device!.status } });
  });

  app.put<{ Params: { id: string } }>("/v1/devices/:id/workspaces", pre, async (req, reply) => {
    const { id } = req.params;
    const userId = app.requireUser(req).id;
    const [device] = await db.select().from(devices).where(and(eq(devices.id, id), eq(devices.userId, userId))).limit(1);
    if (!device) return reply.code(404).send({ error: { code: "not_found", message: "dispositivo não encontrado" } });
    const parsed = z.object({ items: z.array(z.object({ label: z.string().trim().min(1).max(120), path: z.string().trim().min(1).max(2_000) })).max(30) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_body", message: parsed.error.message } });
    await db.transaction(async (tx) => {
      await tx.delete(workspaces).where(and(eq(workspaces.deviceId, id), eq(workspaces.userId, userId)));
      if (parsed.data.items.length) await tx.insert(workspaces).values(parsed.data.items.map((x) => ({ userId, deviceId: id, label: x.label, path: x.path, enabled: true })));
    });
    return { workspaces: parsed.data.items };
  });

  app.get<{ Params: { id: string } }>("/v1/devices/:id/workspaces", pre, async (req, reply) => {
    const userId = app.requireUser(req).id;
    const [device] = await db.select({ id: devices.id }).from(devices).where(and(eq(devices.id, req.params.id), eq(devices.userId, userId))).limit(1);
    if (!device) return reply.code(404).send({ error: { code: "not_found", message: "dispositivo não encontrado" } });
    return { workspaces: await db.select().from(workspaces).where(eq(workspaces.deviceId, req.params.id)) };
  });

  app.post("/v1/tasks", pre, async (req, reply) => {
    const parsed = CreateTaskSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_body", message: parsed.error.message } });
    const userId = app.requireUser(req).id;
    const [device] = await db.select().from(devices).where(and(eq(devices.id, parsed.data.deviceId), eq(devices.userId, userId))).limit(1);
    if (!device) return reply.code(404).send({ error: { code: "device_not_found", message: "dispositivo não encontrado" } });
    const roots = await db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.deviceId, device.id), eq(workspaces.userId, userId), eq(workspaces.enabled, true)));
    if (!roots.length) return reply.code(409).send({ error: { code: "no_workspaces", message: "Autorize ao menos uma pasta no desktop antes de enviar tarefas." } });
    const [task] = await db.insert(tasks).values({ userId, deviceId: device.id, prompt: parsed.data.prompt, providerId: parsed.data.providerId, model: parsed.data.model }).returning();
    return reply.code(201).send({ task });
  });

  app.get("/v1/tasks", pre, async (req) => {
    const rows = await db.select().from(tasks).where(eq(tasks.userId, app.requireUser(req).id)).orderBy(desc(tasks.createdAt)).limit(100);
    return { tasks: rows };
  });

  app.post<{ Params: { id: string } }>("/v1/tasks/:id/cancel", pre, async (req, reply) => {
    const userId = app.requireUser(req).id;
    const [task] = await db.update(tasks).set({
      status: "cancelled", progress: 0, stepLabel: null, finishedAt: new Date(),
    }).where(and(
      eq(tasks.id, req.params.id), eq(tasks.userId, userId),
      // A worker notices cancellation at its next progress update and stops before writing output.
      // Terminal tasks are left intact so their result can still be reviewed.
      inArray(tasks.status, ["pending", "running", "waiting_approval"]),
    )).returning();
    if (!task) return reply.code(409).send({ error: { code: "task_not_active", message: "A tarefa já terminou ou não pode ser cancelada." } });
    return { task };
  });

  app.delete<{ Params: { id: string } }>("/v1/tasks/:id", pre, async (req, reply) => {
    const userId = app.requireUser(req).id;
    const [task] = await db.delete(tasks).where(and(
      eq(tasks.id, req.params.id), eq(tasks.userId, userId),
      inArray(tasks.status, ["completed", "failed", "cancelled"]),
    )).returning({ id: tasks.id });
    if (!task) return reply.code(409).send({ error: { code: "task_not_finished", message: "Cancele ou aguarde a tarefa antes de apagá-la." } });
    return reply.code(204).send();
  });

  app.patch<{ Params: { id: string } }>("/v1/tasks/:id/progress", pre, async (req, reply) => {
    const userId = app.requireUser(req).id;
    const parsed = z.object({ progress: z.number().int().min(1).max(99), stepLabel: z.string().trim().min(1).max(160) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_body", message: parsed.error.message } });
    const [task] = await db.update(tasks).set(parsed.data).where(and(eq(tasks.id, req.params.id), eq(tasks.userId, userId), eq(tasks.status, "running"))).returning({ id: tasks.id });
    if (!task) return reply.code(404).send({ error: { code: "not_found", message: "tarefa ativa não encontrada" } });
    return { ok: true };
  });

  // Desktop worker polls this endpoint; atomic conditional update prevents two windows
  // from claiming the same queued task.
  app.post<{ Params: { id: string } }>("/v1/devices/:id/tasks/claim", pre, async (req, reply) => {
    const userId = app.requireUser(req).id;
    const [device] = await db.select({ id: devices.id }).from(devices).where(and(eq(devices.id, req.params.id), eq(devices.userId, userId))).limit(1);
    if (!device) return reply.code(404).send({ error: { code: "not_found", message: "dispositivo não encontrado" } });
    const [candidate] = await db.select().from(tasks).where(and(eq(tasks.deviceId, device.id), eq(tasks.userId, userId), eq(tasks.status, "pending"))).orderBy(asc(tasks.createdAt)).limit(1);
    if (!candidate) return { task: null };
    const [task] = await db.update(tasks).set({ status: "running", progress: 1, stepLabel: "Iniciando no desktop", startedAt: new Date() }).where(and(eq(tasks.id, candidate.id), eq(tasks.status, "pending"))).returning();
    return { task: task ?? null };
  });

  app.post<{ Params: { id: string } }>("/v1/tasks/:id/result", pre, async (req, reply) => {
    const userId = app.requireUser(req).id;
    const parsed = z.object({ output: z.string().max(40_000).optional(), error: z.string().max(2_000).optional() }).refine((v) => Boolean(v.output) !== Boolean(v.error)).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_body", message: "informe output ou error" } });
    const status = parsed.data.error ? "failed" : "completed";
    const [task] = await db.update(tasks).set({ status, progress: status === "completed" ? 100 : 0, output: parsed.data.output ? { text: parsed.data.output } : null, error: parsed.data.error ?? null, stepLabel: null, finishedAt: new Date() }).where(and(eq(tasks.id, req.params.id), eq(tasks.userId, userId), eq(tasks.status, "running"))).returning();
    if (!task) return reply.code(404).send({ error: { code: "not_found", message: "tarefa ativa não encontrada" } });
    return { task };
  });
}
