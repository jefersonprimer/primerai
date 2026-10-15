import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { calendarIntegrations } from "../db/schema.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { loadConfig } from "../config.js";

const googleTokenUrl = "https://oauth2.googleapis.com/token";
const calendarApi = "https://www.googleapis.com/calendar/v3";
const calendarScope = "https://www.googleapis.com/auth/calendar.events";

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
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: string; exp?: number };
    return parsed.sub && parsed.exp && parsed.exp > Date.now() ? parsed.sub : null;
  } catch { return null; }
}

async function accessToken(app: FastifyInstance, userId: string) {
  const [integration] = await app.db.select().from(calendarIntegrations).where(eq(calendarIntegrations.userId, userId)).limit(1);
  if (!integration) throw new Error("Conecte seu Google Calendar em Conta antes de pedir para criar eventos.");
  if (!integration.expiresAt || integration.expiresAt.getTime() > Date.now() + 60_000) return { token: decryptSecret(integration.accessTokenEnc), calendarId: integration.calendarId };
  if (!integration.refreshTokenEnc) throw new Error("A conexão com o Google Calendar expirou. Conecte novamente em Conta.");
  const cfg = loadConfig();
  if (!cfg.GOOGLE_CLIENT_ID || !cfg.GOOGLE_CLIENT_SECRET) throw new Error("A integração do Google Calendar não está configurada no servidor.");
  const response = await fetch(googleTokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: cfg.GOOGLE_CLIENT_ID, client_secret: cfg.GOOGLE_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: decryptSecret(integration.refreshTokenEnc) }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("A conexão com o Google Calendar expirou. Conecte novamente em Conta.");
  const refreshed = await response.json() as { access_token?: string; expires_in?: number };
  if (!refreshed.access_token) throw new Error("O Google Calendar não retornou um token válido.");
  await app.db.update(calendarIntegrations).set({ accessTokenEnc: encryptSecret(refreshed.access_token), expiresAt: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000), updatedAt: new Date() }).where(eq(calendarIntegrations.userId, userId));
  return { token: refreshed.access_token, calendarId: integration.calendarId };
}

export async function createCalendarEvent(app: FastifyInstance, userId: string, event: { summary: string; description?: string; start: string; end: string }) {
  const auth = await accessToken(app, userId);
  const response = await fetch(`${calendarApi}/calendars/${encodeURIComponent(auth.calendarId)}/events`, { method: "POST", headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" }, body: JSON.stringify({ summary: event.summary, ...(event.description ? { description: event.description } : {}), start: { dateTime: event.start }, end: { dateTime: event.end } }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "O Google Calendar recusou o acesso. Conecte novamente em Conta." : "Não foi possível criar o evento no Google Calendar.");
  const created = await response.json() as { id?: string; htmlLink?: string };
  return { id: created.id ?? null, url: created.htmlLink ?? null };
}

export async function calendarRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };
  app.get("/v1/integrations/calendar", auth, async (req) => {
    const [row] = await app.db.select({ calendarId: calendarIntegrations.calendarId }).from(calendarIntegrations).where(eq(calendarIntegrations.userId, app.requireUser(req).id)).limit(1);
    return { connected: Boolean(row), calendarId: row?.calendarId ?? null };
  });
  app.get("/v1/integrations/calendar/connect", auth, async (req, reply) => {
    const cfg = loadConfig();
    if (!cfg.GOOGLE_CLIENT_ID || !cfg.CALENDAR_REDIRECT_URI) return reply.code(503).send({ error: { code: "calendar_unconfigured", message: "A integração do Google Calendar não está configurada no servidor." } });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: cfg.GOOGLE_CLIENT_ID, redirect_uri: cfg.CALENDAR_REDIRECT_URI, response_type: "code", scope: calendarScope, state: makeState(app.requireUser(req).id), access_type: "offline", prompt: "consent" }).toString();
    return { authorizationUrl: url.toString() };
  });
  app.post("/v1/integrations/calendar/callback", async (req, reply) => {
    const parsed = z.object({ code: z.string().min(1).max(2048), state: z.string().min(1).max(4096) }).strict().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_oauth_callback", message: "Resposta de autorização inválida." } });
    const userId = readState(parsed.data.state);
    const cfg = loadConfig();
    if (!userId || !cfg.GOOGLE_CLIENT_ID || !cfg.GOOGLE_CLIENT_SECRET || !cfg.CALENDAR_REDIRECT_URI) return reply.code(400).send({ error: { code: "calendar_oauth_failed", message: "A autorização expirou ou a integração não está configurada." } });
    const response = await fetch(googleTokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: parsed.data.code, client_id: cfg.GOOGLE_CLIENT_ID, client_secret: cfg.GOOGLE_CLIENT_SECRET, redirect_uri: cfg.CALENDAR_REDIRECT_URI, grant_type: "authorization_code" }), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return reply.code(502).send({ error: { code: "calendar_oauth_failed", message: "O Google não concluiu a conexão. Tente novamente." } });
    const token = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!token.access_token) return reply.code(502).send({ error: { code: "calendar_oauth_failed", message: "O Google não retornou um token de acesso." } });
    const [current] = await app.db.select().from(calendarIntegrations).where(eq(calendarIntegrations.userId, userId)).limit(1);
    await app.db.insert(calendarIntegrations).values({ userId, accessTokenEnc: encryptSecret(token.access_token), refreshTokenEnc: token.refresh_token ? encryptSecret(token.refresh_token) : current?.refreshTokenEnc ?? null, expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000) }).onConflictDoUpdate({ target: calendarIntegrations.userId, set: { accessTokenEnc: encryptSecret(token.access_token), refreshTokenEnc: token.refresh_token ? encryptSecret(token.refresh_token) : current?.refreshTokenEnc ?? null, expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000), updatedAt: new Date() } });
    return { connected: true };
  });
  app.delete("/v1/integrations/calendar", auth, async (req, reply) => { await app.db.delete(calendarIntegrations).where(eq(calendarIntegrations.userId, app.requireUser(req).id)); return reply.code(204).send(); });
}
