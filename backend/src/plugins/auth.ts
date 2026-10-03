import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { sessions, users } from "../db/schema.js";
import { verifyToken, type AccessClaims } from "../lib/auth-crypto.js";
import { loadConfig } from "../config.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  sessionId: string;
}

declare module "fastify" {
  interface FastifyInstance {
    /** devolve o usuário do access token ou 401 */
    requireUser(req: FastifyRequest): AuthUser;
    authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();

  const query = (req.query as { access_token?: string } | undefined)?.access_token;
  if (query) return query;

  const cookie = req.headers.cookie;
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === "pa_access") return decodeURIComponent(v.join("="));
    }
  }

  return null;
}

export const authPlugin = fp(async (app: FastifyInstance, _opts: unknown) => {
  const cfg = loadConfig();
  const db = app.db as Database;

  app.decorate("authenticate", async function (req: FastifyRequest, reply: FastifyReply) {
    const token = extractToken(req);
    if (!token) {
      return reply.code(401).send({ error: { code: "unauthorized", message: "token ausente" } });
    }

    const claims = verifyToken<AccessClaims>(token, cfg.JWT_SECRET);
    if (!claims || claims.typ !== "access") {
      return reply.code(401).send({ error: { code: "unauthorized", message: "token inválido ou expirado" } });
    }

    // sessão revogada = token válido mas device deslogado
    const [session] = await db
      .select({ id: sessions.id, revokedAt: sessions.revokedAt, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.id, claims.sid))
      .limit(1);

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return reply.code(401).send({ error: { code: "session_revoked", message: "sessão encerrada" } });
    }

    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, claims.sub))
      .limit(1);

    if (!user) {
      return reply.code(401).send({ error: { code: "unauthorized", message: "usuário não existe" } });
    }

    (req as FastifyRequest & { user: AuthUser }).user = { ...user, sessionId: claims.sid };
  });

  app.decorate("requireUser", function (req: FastifyRequest): AuthUser {
    const user = (req as FastifyRequest & { user?: AuthUser }).user;
    if (!user) throw new Error("requireUser chamado sem authenticate");
    return user;
  });

  app.decorateRequest("user", null);
});