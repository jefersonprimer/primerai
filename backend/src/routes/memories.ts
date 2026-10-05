import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { memories } from "../db/schema.js";

const KeySchema = z.string().trim().min(1).max(120);
const ValueSchema = z.string().trim().min(1).max(2_000);

function toMemory(row: typeof memories.$inferSelect) {
  return { key: row.key, value: typeof row.value === "string" ? row.value : JSON.stringify(row.value), createdAt: row.createdAt.toISOString() };
}

export async function memoryRoutes(app: FastifyInstance) {
  const db = app.db;
  const pre = { preHandler: app.authenticate };

  app.get("/v1/memories", pre, async (req) => {
    const userId = app.requireUser(req).id;
    const rows = await db.select().from(memories).where(eq(memories.userId, userId)).orderBy(asc(memories.key));
    return { memories: rows.map(toMemory) };
  });

  app.put<{ Params: { key: string } }>("/v1/memories/:key", pre, async (req, reply) => {
    const key = KeySchema.safeParse(req.params.key);
    const body = z.object({ value: ValueSchema }).safeParse(req.body);
    if (!key.success || !body.success) {
      return reply.code(400).send({ error: { code: "invalid_body", message: "Informe uma chave e um valor de memória válidos." } });
    }
    const userId = app.requireUser(req).id;
    const [row] = await db.insert(memories).values({ userId, key: key.data, value: body.data.value })
      .onConflictDoUpdate({ target: [memories.userId, memories.key], set: { value: body.data.value } })
      .returning();
    return { memory: toMemory(row!) };
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
