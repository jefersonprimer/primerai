import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { notionIntegrations } from "../db/schema.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { loadConfig } from "../config.js";

const api = "https://api.notion.com/v1";
const notionVersion = "2022-06-28";
export async function createNotionNote(db: FastifyInstance["db"], userId: string, title: string, content: string) {
  const [row] = await db.select().from(notionIntegrations).where(eq(notionIntegrations.userId, userId)).limit(1);
  if (!row) throw new Error("Conecte seu Notion em Conta antes de pedir para criar notas.");
  const headers = { authorization: `Bearer ${decryptSecret(row.accessTokenEnc)}`, "content-type": "application/json", "Notion-Version": notionVersion };
  const search = await fetch(`${api}/search`, { method: "POST", headers, body: JSON.stringify({ page_size: 1, sort: { direction: "descending", timestamp: "last_edited_time" } }), signal: AbortSignal.timeout(15_000) });
  if (!search.ok) throw new Error("Não foi possível localizar uma página do Notion. Compartilhe uma página com o PrimerAI e tente novamente.");
  const searchBody = await search.json() as { results?: { id: string; object: string; parent?: { type?: string; page_id?: string } }[] };
  const page = searchBody.results?.find((item) => item.object === "page");
  if (!page) throw new Error("Compartilhe uma página do Notion com o PrimerAI para definir onde guardar as notas.");
  const parent = page.parent?.type === "page_id" && page.parent.page_id ? { page_id: page.parent.page_id } : { page_id: page.id };
  const children = content.slice(0, 20_000).split("\n").filter(Boolean).slice(0, 100).map((line) => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: line.slice(0, 2000) } }] } }));
  const created = await fetch(`${api}/pages`, { method: "POST", headers, body: JSON.stringify({ parent, properties: { title: { title: [{ type: "text", text: { content: title } }] } }, children }), signal: AbortSignal.timeout(20_000) });
  if (!created.ok) throw new Error("Não foi possível criar a nota no Notion. Confira o acesso à página compartilhada.");
  const result = await created.json() as { id: string; url?: string };
  return { id: result.id, url: result.url ?? null, title };
}
function signature(value: string) {
  return createHmac("sha256", loadConfig().JWT_SECRET).update(value).digest("base64url");
}
function makeState(userId: string) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + 10 * 60_000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
function readState(state: string): string | null {
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(signature(payload));
  const actual = Buffer.from(mac);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: string; exp?: number };
    return data.sub && data.exp && data.exp > Date.now() ? data.sub : null;
  } catch { return null; }
}

export async function notionRoutes(app: FastifyInstance) {
  const cfg = loadConfig();
  const auth = { preHandler: app.authenticate };

  app.get("/v1/integrations/notion", auth, async (req) => {
    const [row] = await app.db.select({ workspaceName: notionIntegrations.workspaceName, workspaceId: notionIntegrations.workspaceId })
      .from(notionIntegrations).where(eq(notionIntegrations.userId, app.requireUser(req).id)).limit(1);
    return { connected: Boolean(row), workspaceName: row?.workspaceName ?? null };
  });

  app.get("/v1/integrations/notion/connect", auth, async (req, reply) => {
    if (!cfg.NOTION_CLIENT_ID || !cfg.NOTION_REDIRECT_URI) return reply.code(503).send({ error: { code: "notion_unconfigured", message: "A integração do Notion não está configurada no servidor." } });
    const params = new URLSearchParams({ client_id: cfg.NOTION_CLIENT_ID, response_type: "code", owner: "user", redirect_uri: cfg.NOTION_REDIRECT_URI, state: makeState(app.requireUser(req).id) });
    const url = new URL(cfg.NOTION_AUTHORIZATION_URL ?? `${api}/oauth/authorize`);
    url.search = params.toString();
    return { authorizationUrl: url.toString() };
  });

  app.post("/v1/integrations/notion/callback", async (req, reply) => {
    const parsed = z.object({ code: z.string().min(1).max(2048), state: z.string().min(1).max(4096) }).strict().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_oauth_callback", message: "Resposta de autorização inválida." } });
    const userId = readState(parsed.data.state);
    if (!userId) return reply.code(400).send({ error: { code: "invalid_oauth_state", message: "A autorização expirou ou não é válida. Tente conectar novamente." } });
    if (!cfg.NOTION_CLIENT_ID || !cfg.NOTION_CLIENT_SECRET || !cfg.NOTION_REDIRECT_URI) return reply.code(503).send({ error: { code: "notion_unconfigured", message: "A integração do Notion não está configurada." } });
    const tokenResponse = await fetch(`${api}/oauth/token`, {
      method: "POST", headers: { authorization: `Basic ${Buffer.from(`${cfg.NOTION_CLIENT_ID}:${cfg.NOTION_CLIENT_SECRET}`).toString("base64")}`, "content-type": "application/json", "Notion-Version": notionVersion },
      body: JSON.stringify({ grant_type: "authorization_code", code: parsed.data.code, redirect_uri: cfg.NOTION_REDIRECT_URI }), signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResponse.ok) {
      req.log.warn({ status: tokenResponse.status }, "Notion token exchange failed");
      return reply.code(502).send({ error: { code: "notion_oauth_failed", message: "O Notion não concluiu a conexão. Tente novamente." } });
    }
    const token = await tokenResponse.json() as { access_token?: string; workspace_id?: string; workspace_name?: string; bot_id?: string };
    if (!token.access_token) return reply.code(502).send({ error: { code: "notion_oauth_failed", message: "O Notion não retornou um token de acesso." } });
    await app.db.insert(notionIntegrations).values({ userId, accessTokenEnc: encryptSecret(token.access_token), workspaceId: token.workspace_id ?? null, workspaceName: token.workspace_name ?? null, botId: token.bot_id ?? null })
      .onConflictDoUpdate({ target: notionIntegrations.userId, set: { accessTokenEnc: encryptSecret(token.access_token), workspaceId: token.workspace_id ?? null, workspaceName: token.workspace_name ?? null, botId: token.bot_id ?? null, updatedAt: new Date() } });
    return { connected: true };
  });

  app.delete("/v1/integrations/notion", auth, async (req, reply) => {
    await app.db.delete(notionIntegrations).where(eq(notionIntegrations.userId, app.requireUser(req).id));
    return reply.code(204).send();
  });

  app.post("/v1/integrations/notion/pages", auth, async (req, reply) => {
    const parsed = z.object({ title: z.string().trim().min(1).max(200), content: z.string().trim().min(1).max(20_000) }).strict().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_body", message: parsed.error.message } });
    try {
      return reply.code(201).send(await createNotionNote(app.db, app.requireUser(req).id, parsed.data.title, parsed.data.content));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível criar a nota no Notion.";
      return reply.code(message.startsWith("Conecte") || message.startsWith("Compartilhe") ? 409 : 502).send({ error: { code: "notion_page_failed", message } });
    }
  });
}
