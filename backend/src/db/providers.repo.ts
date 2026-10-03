import { and, desc, eq, sql } from "drizzle-orm";
import type { AiProvider, CreateProviderInput, ProviderId, UpdateProviderInput } from "@primerai/shared";
import { getProviderEntry, maskApiKey } from "@primerai/shared";
import type { Database } from "./client.js";
import { aiProviders } from "./schema.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";

type Row = typeof aiProviders.$inferSelect;

export function toApi(row: Row): AiProvider {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    baseUrl: row.baseUrl,
    keyHint: row.keyHint,
    defaultModel: row.defaultModel,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export const providersRepo = {
  async list(db: Database, userId: string): Promise<Row[]> {
    return db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.userId, userId))
      .orderBy(desc(aiProviders.isDefault), desc(aiProviders.createdAt));
  },

  async get(db: Database, userId: string, id: string): Promise<Row | undefined> {
    const [row] = await db
      .select()
      .from(aiProviders)
      .where(and(eq(aiProviders.id, id), eq(aiProviders.userId, userId)))
      .limit(1);
    return row;
  },

  async getDefault(db: Database, userId: string): Promise<Row | undefined> {
    const [row] = await db
      .select()
      .from(aiProviders)
      .where(and(eq(aiProviders.userId, userId), eq(aiProviders.isDefault, true)))
      .limit(1);
    return row;
  },

  async count(db: Database, userId: string): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiProviders)
      .where(eq(aiProviders.userId, userId));
    return row?.n ?? 0;
  },

  async create(db: Database, userId: string, input: CreateProviderInput): Promise<Row> {
    const entry = getProviderEntry(input.provider);
    const apiKey = input.apiKey.trim();
    const baseUrl = input.baseUrl?.trim() || entry.defaultBaseUrl;
    const isFirst = (await this.count(db, userId)) === 0;
    const makeDefault = input.makeDefault ?? isFirst;

    return db.transaction(async (tx) => {
      if (makeDefault) await clearDefault(tx, userId);

      const [row] = await tx
        .insert(aiProviders)
        .values({
          userId,
          provider: input.provider,
          label: input.label?.trim() || entry.label,
          baseUrl,
          apiKeyEnc: encryptSecret(apiKey),
          keyHint: entry.keyRequired ? maskApiKey(apiKey) : "sem chave",
          defaultModel: input.defaultModel?.trim() || entry.suggestedModel,
          isDefault: makeDefault,
        })
        .returning();

      return row!;
    });
  },

  async update(db: Database, userId: string, id: string, input: UpdateProviderInput): Promise<Row | undefined> {
    const patch: Partial<typeof aiProviders.$inferInsert> = {};
    if (input.label !== undefined) patch.label = input.label.trim();
    if (input.baseUrl !== undefined) patch.baseUrl = input.baseUrl.trim();
    if (input.defaultModel !== undefined) patch.defaultModel = input.defaultModel;
    if (input.apiKey !== undefined && input.apiKey.trim()) {
      const key = input.apiKey.trim();
      patch.apiKeyEnc = encryptSecret(key);
      patch.keyHint = maskApiKey(key);
    }
    patch.updatedAt = new Date();

    return db.transaction(async (tx) => {
      if (input.isDefault) {
        await clearDefault(tx, userId);
        patch.isDefault = true;
      }

      const [row] = await tx
        .update(aiProviders)
        .set(patch)
        .where(and(eq(aiProviders.id, id), eq(aiProviders.userId, userId)))
        .returning();

      return row;
    });
  },

  async remove(db: Database, userId: string, id: string): Promise<boolean> {
    const deleted = await db
      .delete(aiProviders)
      .where(and(eq(aiProviders.id, id), eq(aiProviders.userId, userId)))
      .returning({ id: aiProviders.id });

    if (deleted.length === 0) return false;

    // nunca deixar o usuário sem provider padrão quando ainda tiver outros
    const remaining = await this.list(db, userId);
    if (remaining.length > 0 && !remaining.some((r) => r.isDefault)) {
      await db
        .update(aiProviders)
        .set({ isDefault: true })
        .where(eq(aiProviders.id, remaining[0]!.id));
    }

    return true;
  },

  async touch(db: Database, id: string): Promise<void> {
    await db.update(aiProviders).set({ lastUsedAt: new Date() }).where(eq(aiProviders.id, id));
  },
};

/** devolve a key em claro — só para uso interno do agent loop */
export function revealKey(row: Row, provider: ProviderId): string {
  if (provider === "ollama" && !row.apiKeyEnc) return "";
  return decryptSecret(row.apiKeyEnc);
}

async function clearDefault(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  userId: string,
): Promise<void> {
  await tx
    .update(aiProviders)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(and(eq(aiProviders.userId, userId), eq(aiProviders.isDefault, true)));
}