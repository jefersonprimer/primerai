import { and, asc, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { memories, memorySettings, memorySuggestions, projectProfiles } from "../db/schema.js";
import type { Database } from "../db/client.js";

const KeySchema = z.string().trim().min(1).max(120);
const ValueSchema = z.string().trim().min(1).max(2_000);
const CategorySchema = z.enum(["preference", "writing_style", "project", "workflow", "person", "goal", "context", "history"]);
const ProjectStatusSchema = z.enum(["active", "paused", "completed", "archived"]);
const DateSchema = z.string().datetime({ offset: true }).transform((value) => new Date(value));
const TextListSchema = z.array(z.string().trim().min(1).max(300)).max(30);

async function getSettings(db: Database, userId: string) {
  const [row] = await db.insert(memorySettings).values({ userId }).onConflictDoNothing().returning();
  if (row) return row;
  const [existing] = await db.select().from(memorySettings).where(eq(memorySettings.userId, userId)).limit(1);
  return existing!;
}

export function toMemory(row: typeof memories.$inferSelect) {
  return { key: row.key, value: typeof row.value === "string" ? row.value : JSON.stringify(row.value), category: row.category, origin: row.origin, projectId: row.projectId, validUntil: row.validUntil?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function toProject(row: typeof projectProfiles.$inferSelect) {
  return { id: row.id, name: row.name, objective: row.objective, stack: row.stack, decisions: row.decisions, status: row.status, lastConfirmedAt: row.lastConfirmedAt.toISOString(), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function memoryRoutes(app: FastifyInstance) {
  const db = app.db;
  const pre = { preHandler: app.authenticate };

  app.get("/v1/memories", pre, async (req) => {
    const userId = app.requireUser(req).id;
    const rows = await db.select().from(memories).where(eq(memories.userId, userId)).orderBy(asc(memories.key));
    return { memories: rows.map(toMemory) };
  });

  app.delete("/v1/memories", pre, async (req, reply) => {
    const userId = app.requireUser(req).id;
    await db.transaction(async (tx) => {
      await tx.delete(memories).where(eq(memories.userId, userId));
      await tx.delete(memorySuggestions).where(eq(memorySuggestions.userId, userId));
    });
    return reply.code(204).send();
  });

  app.get("/v1/projects", pre, async (req) => {
    const userId = app.requireUser(req).id;
    const rows = await db.select().from(projectProfiles).where(eq(projectProfiles.userId, userId)).orderBy(desc(projectProfiles.updatedAt));
    return { projects: rows.map(toProject) };
  });

  app.post("/v1/projects", pre, async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(120), objective: z.string().trim().max(2_000).nullable().optional(), stack: TextListSchema.optional(), decisions: TextListSchema.optional(), status: ProjectStatusSchema.optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: { code: "invalid_body", message: "Informe uma ficha de projeto válida." } });
    const userId = app.requireUser(req).id;
    const [project] = await db.insert(projectProfiles).values({ userId, name: body.data.name, objective: body.data.objective ?? null, stack: body.data.stack ?? [], decisions: body.data.decisions ?? [], status: body.data.status ?? "active" }).returning();
    return reply.code(201).send({ project: toProject(project!) });
  });

  app.patch<{ Params: { id: string } }>("/v1/projects/:id", pre, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const body = z.object({ name: z.string().trim().min(1).max(120).optional(), objective: z.string().trim().max(2_000).nullable().optional(), stack: TextListSchema.optional(), decisions: TextListSchema.optional(), status: ProjectStatusSchema.optional(), confirm: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0).safeParse(req.body);
    if (!id.success || !body.success) return reply.code(400).send({ error: { code: "invalid_body", message: "Informe uma atualização de projeto válida." } });
    const { confirm, ...update } = body.data;
    const [project] = await db.update(projectProfiles).set({ ...update, ...(confirm ? { lastConfirmedAt: new Date() } : {}), updatedAt: new Date() }).where(and(eq(projectProfiles.id, id.data), eq(projectProfiles.userId, app.requireUser(req).id))).returning();
    if (!project) return reply.code(404).send({ error: { code: "not_found", message: "Projeto não encontrado." } });
    return { project: toProject(project) };
  });

  app.delete<{ Params: { id: string } }>("/v1/projects/:id", pre, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return reply.code(400).send({ error: { code: "invalid_id", message: "Identificador de projeto inválido." } });
    const deleted = await db.delete(projectProfiles).where(and(eq(projectProfiles.id, id.data), eq(projectProfiles.userId, app.requireUser(req).id))).returning({ id: projectProfiles.id });
    if (!deleted.length) return reply.code(404).send({ error: { code: "not_found", message: "Projeto não encontrado." } });
    return reply.code(204).send();
  });

  app.get("/v1/memory-settings", pre, async (req) => {
    const settings = await getSettings(db, app.requireUser(req).id);
    return { settings: { useMemoriesInChat: settings.useMemoriesInChat, automaticSuggestionsEnabled: settings.automaticSuggestionsEnabled } };
  });

  app.patch("/v1/memory-settings", pre, async (req, reply) => {
    const parsed = z.object({ useMemoriesInChat: z.boolean().optional(), automaticSuggestionsEnabled: z.boolean().optional() })
      .refine((value) => value.useMemoriesInChat !== undefined || value.automaticSuggestionsEnabled !== undefined).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_body", message: "Informe uma preferência válida para a memória." } });
    const userId = app.requireUser(req).id;
    const settings = await getSettings(db, userId);
    const [updated] = await db.update(memorySettings).set({ ...parsed.data, updatedAt: new Date() }).where(eq(memorySettings.userId, userId)).returning();
    return { settings: { useMemoriesInChat: updated?.useMemoriesInChat ?? settings.useMemoriesInChat, automaticSuggestionsEnabled: updated?.automaticSuggestionsEnabled ?? settings.automaticSuggestionsEnabled } };
  });

  app.get("/v1/memory-suggestions", pre, async (req) => {
    const userId = app.requireUser(req).id;
    const rows = await db.select().from(memorySuggestions).where(and(eq(memorySuggestions.userId, userId), eq(memorySuggestions.status, "pending"))).orderBy(desc(memorySuggestions.createdAt)).limit(50);
    return { suggestions: rows.map((row) => ({ id: row.id, key: row.key, value: row.value, category: row.category, createdAt: row.createdAt.toISOString() })) };
  });

  app.post<{ Params: { id: string } }>("/v1/memory-suggestions/:id/accept", pre, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    const parsed = z.object({ key: KeySchema.optional(), value: ValueSchema.optional(), category: CategorySchema.optional() }).safeParse(req.body ?? {});
    if (!id.success || !parsed.success) return reply.code(400).send({ error: { code: "invalid_body", message: "A sugestão contém dados inválidos." } });
    const userId = app.requireUser(req).id;
    const [suggestion] = await db.select().from(memorySuggestions).where(and(eq(memorySuggestions.id, id.data), eq(memorySuggestions.userId, userId), eq(memorySuggestions.status, "pending"))).limit(1);
    if (!suggestion) return reply.code(404).send({ error: { code: "not_found", message: "Sugestão não encontrada." } });
    const [memory] = await db.insert(memories).values({
      userId, key: parsed.data.key ?? suggestion.key, value: parsed.data.value ?? suggestion.value,
      category: parsed.data.category ?? suggestion.category, origin: "accepted_suggestion",
      sourceConversationId: suggestion.sourceConversationId, sourceMessageId: suggestion.sourceMessageId,
    }).onConflictDoUpdate({ target: [memories.userId, memories.key], set: {
      value: parsed.data.value ?? suggestion.value, category: parsed.data.category ?? suggestion.category,
      origin: "accepted_suggestion", sourceConversationId: suggestion.sourceConversationId,
      sourceMessageId: suggestion.sourceMessageId, updatedAt: new Date(),
    } }).returning();
    await db.update(memorySuggestions).set({ status: "accepted", reviewedAt: new Date() }).where(eq(memorySuggestions.id, suggestion.id));
    return { memory: toMemory(memory!) };
  });

  app.post<{ Params: { id: string } }>("/v1/memory-suggestions/:id/dismiss", pre, async (req, reply) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) return reply.code(400).send({ error: { code: "invalid_id", message: "Identificador da sugestão inválido." } });
    const userId = app.requireUser(req).id;
    const [row] = await db.update(memorySuggestions).set({ status: "dismissed", reviewedAt: new Date() })
      .where(and(eq(memorySuggestions.id, id.data), eq(memorySuggestions.userId, userId), eq(memorySuggestions.status, "pending"))).returning({ id: memorySuggestions.id });
    if (!row) return reply.code(404).send({ error: { code: "not_found", message: "Sugestão não encontrada." } });
    return reply.code(204).send();
  });

  app.put<{ Params: { key: string } }>("/v1/memories/:key", pre, async (req, reply) => {
    const key = KeySchema.safeParse(req.params.key);
    const body = z.object({ value: ValueSchema, category: CategorySchema.optional(), projectId: z.string().uuid().nullable().optional(), validUntil: DateSchema.nullable().optional() }).safeParse(req.body);
    if (!key.success || !body.success) {
      return reply.code(400).send({ error: { code: "invalid_body", message: "Informe uma chave e um valor de memória válidos." } });
    }
    const userId = app.requireUser(req).id;
    if (body.data.projectId) {
      const [project] = await db.select({ id: projectProfiles.id }).from(projectProfiles).where(and(eq(projectProfiles.id, body.data.projectId), eq(projectProfiles.userId, userId))).limit(1);
      if (!project) return reply.code(400).send({ error: { code: "invalid_project", message: "Projeto não encontrado." } });
    }
    const [row] = await db.insert(memories).values({ userId, key: key.data, value: body.data.value, category: body.data.category ?? "context", projectId: body.data.projectId ?? null, validUntil: body.data.validUntil ?? null, origin: "manual" })
      .onConflictDoUpdate({ target: [memories.userId, memories.key], set: { value: body.data.value, category: body.data.category ?? "context", projectId: body.data.projectId ?? null, validUntil: body.data.validUntil ?? null, origin: "manual", updatedAt: new Date() } })
      .returning();
    return { memory: toMemory(row!) };
  });

  app.patch<{ Params: { key: string } }>("/v1/memories/:key", pre, async (req, reply) => {
    const key = KeySchema.safeParse(req.params.key);
    const body = z.object({ value: ValueSchema.optional(), category: CategorySchema.optional(), projectId: z.string().uuid().nullable().optional(), validUntil: DateSchema.nullable().optional() })
      .refine((value) => value.value !== undefined || value.category !== undefined || value.projectId !== undefined || value.validUntil !== undefined).safeParse(req.body);
    if (!key.success || !body.success) return reply.code(400).send({ error: { code: "invalid_body", message: "Informe um valor ou categoria válidos." } });
    const userId = app.requireUser(req).id;
    if (body.data.projectId) {
      const [project] = await db.select({ id: projectProfiles.id }).from(projectProfiles).where(and(eq(projectProfiles.id, body.data.projectId), eq(projectProfiles.userId, userId))).limit(1);
      if (!project) return reply.code(400).send({ error: { code: "invalid_project", message: "Projeto não encontrado." } });
    }
    const [row] = await db.update(memories).set({ ...body.data, origin: "manual", updatedAt: new Date() })
      .where(and(eq(memories.userId, userId), eq(memories.key, key.data))).returning();
    if (!row) return reply.code(404).send({ error: { code: "not_found", message: "memória não encontrada" } });
    return { memory: toMemory(row) };
  });

  app.delete<{ Params: { key: string } }>("/v1/memories/:key", pre, async (req, reply) => {
    const key = KeySchema.safeParse(req.params.key);
    if (!key.success) return reply.code(400).send({ error: { code: "invalid_key", message: "Chave de memória inválida." } });
    const userId = app.requireUser(req).id;
    const deleted = await db.delete(memories).where(and(eq(memories.userId, userId), eq(memories.key, key.data))).returning({ key: memories.key });
    if (!deleted.length) return reply.code(404).send({ error: { code: "not_found", message: "memória não encontrada" } });
    return reply.code(204).send();
  });
}
