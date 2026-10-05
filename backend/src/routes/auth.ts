import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { routes } from "@primerai/shared";
import { nativeAuthCodes, sessions, users } from "../db/schema.js";
import {
  hashPassword,
  parseDuration,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyToken,
  type RefreshClaims,
} from "../lib/auth-crypto.js";
import { loadConfig } from "../config.js";

const RegisterSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().max(120).optional(),
});

const LoginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

const RefreshSchema = z.object({ refreshToken: z.string().min(10) });
const GoogleSchema = z.object({ idToken: z.string().min(20).max(10_000) });
const NativeExchangeSchema = z.object({ code: z.string().min(32).max(100) });

/** resposta de sessão, idêntica em desktop e mobile */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  user: { id: string; email: string; name: string | null };
}

export async function authRoutes(app: FastifyInstance) {
  const db = app.db;
  const cfg = loadConfig();
  const accessTtl = parseDuration(cfg.JWT_ACCESS_TTL, 900);
  const refreshTtl = parseDuration(cfg.JWT_REFRESH_TTL, 60 * 60 * 24 * 30);
  const googleClient = cfg.GOOGLE_CLIENT_ID ? new OAuth2Client(cfg.GOOGLE_CLIENT_ID) : null;

  async function issueSession(
    user: { id: string; email: string; name: string | null },
    userAgent: string | undefined,
  ): Promise<SessionTokens> {
    const [session] = await db
      .insert(sessions)
      .values({
        userId: user.id,
        refreshTokenHash: "",
        userAgent: userAgent ?? null,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      })
      .returning();

    const refreshToken = signRefreshToken({
      userId: user.id,
      sessionId: session!.id,
      secret: cfg.JWT_REFRESH_SECRET,
      ttlSeconds: refreshTtl,
    });

    // só o hash do refresh token vai pro banco
    await db
      .update(sessions)
      .set({ refreshTokenHash: hashToken(refreshToken) })
      .where(eq(sessions.id, session!.id));

    return {
      accessToken: signAccessToken({
        userId: user.id,
        sessionId: session!.id,
        secret: cfg.JWT_SECRET,
        ttlSeconds: accessTtl,
      }),
      refreshToken,
      accessExpiresIn: accessTtl,
      user,
    };
  }

  app.post("/v1/auth/register", async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_body", message: parsed.error.message } });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      return reply
        .code(409)
        .send({ error: { code: "email_taken", message: "já existe uma conta com esse e-mail" } });
    }

    const [user] = await db
      .insert(users)
      .values({ email, name: parsed.data.name ?? null, passwordHash: await hashPassword(parsed.data.password) })
      .returning({ id: users.id, email: users.email, name: users.name });

    return reply.code(201).send({ session: await issueSession(user!, req.headers["user-agent"]) });
  });

  app.post("/v1/auth/google", async (req, reply) => {
    if (!googleClient || !cfg.GOOGLE_CLIENT_ID) {
      return reply.code(503).send({ error: { code: "google_auth_unavailable", message: "Login com Google não está configurado." } });
    }
    const parsed = GoogleSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_body", message: "Token do Google inválido." } });

    let claims: { sub: string; email?: string; email_verified?: boolean; name?: string } | undefined;
    try {
      claims = (await googleClient.verifyIdToken({ idToken: parsed.data.idToken, audience: cfg.GOOGLE_CLIENT_ID })).getPayload();
    } catch (err) {
      req.log.info({ err }, "token de login Google rejeitado");
      return reply.code(401).send({ error: { code: "invalid_google_token", message: "Não foi possível validar sua conta Google." } });
    }
    if (!claims?.sub || !claims.email || claims.email_verified !== true) {
      return reply.code(401).send({ error: { code: "google_identity_unverified", message: "A conta Google precisa ter um e-mail verificado." } });
    }

    const email = claims.email.trim().toLowerCase();
    let [user] = await db.select().from(users).where(eq(users.googleSub, claims.sub)).limit(1);
    if (!user) {
      const [byEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (byEmail?.googleSub && byEmail.googleSub !== claims.sub) {
        return reply.code(409).send({ error: { code: "google_account_conflict", message: "Este e-mail já está associado a outra conta Google." } });
      }
      if (byEmail) {
        [user] = await db.update(users).set({ googleSub: claims.sub, name: byEmail.name ?? claims.name ?? null })
          .where(eq(users.id, byEmail.id)).returning();
      } else {
        [user] = await db.insert(users).values({
          email,
          googleSub: claims.sub,
          name: claims.name ?? null,
          passwordHash: await hashPassword(randomBytes(48).toString("base64url")),
        }).returning();
      }
    }

    return { session: await issueSession({ id: user!.id, email: user!.email, name: user!.name }, req.headers["user-agent"]) };
  });

  app.post("/v1/auth/native-code", { preHandler: app.authenticate }, async (req) => {
    const user = app.requireUser(req);
    const code = newOpaqueToken(32);
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.delete(nativeAuthCodes).where(lt(nativeAuthCodes.expiresAt, now));
      await tx.insert(nativeAuthCodes).values({ userId: user.id, codeHash: hashToken(code), expiresAt: new Date(now.getTime() + 2 * 60_000) });
      await tx.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, user.sessionId));
    });
    return { code };
  });

  app.post("/v1/auth/native-exchange", async (req, reply) => {
    const parsed = NativeExchangeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "invalid_body", message: "Código de login inválido." } });
    const now = new Date();
    const [claimed] = await db.update(nativeAuthCodes).set({ consumedAt: now })
      .where(and(eq(nativeAuthCodes.codeHash, hashToken(parsed.data.code)), isNull(nativeAuthCodes.consumedAt), gt(nativeAuthCodes.expiresAt, now)))
      .returning({ userId: nativeAuthCodes.userId });
    if (!claimed) return reply.code(401).send({ error: { code: "invalid_native_code", message: "O código de login expirou ou já foi usado." } });
    const [user] = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, claimed.userId)).limit(1);
    if (!user) return reply.code(401).send({ error: { code: "unauthorized", message: "usuário não existe" } });
    return { session: await issueSession(user, req.headers["user-agent"]) };
  });

  app.post("/v1/auth/login", async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_body", message: parsed.error.message } });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    // mensagem genérica de propósito: não revela se o e-mail existe
    const invalid = () =>
      reply.code(401).send({ error: { code: "invalid_credentials", message: "e-mail ou senha inválidos" } });

    if (!user) {
      // gasta o mesmo tempo do hash real pra não vazar existência por timing
      await verifyPassword(parsed.data.password, await hashPassword("placeholder"));
      return invalid();
    }

    if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return invalid();

    return {
      session: await issueSession(
        { id: user.id, email: user.email, name: user.name },
        req.headers["user-agent"],
      ),
    };
  });

  /** rotação: cada refresh invalida o token anterior */
  app.post("/v1/auth/refresh", async (req, reply) => {
    const parsed = RefreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_body", message: parsed.error.message } });
    }

    const claims = verifyToken<RefreshClaims>(parsed.data.refreshToken, cfg.JWT_REFRESH_SECRET);
    if (!claims || claims.typ !== "refresh") {
      return reply.code(401).send({ error: { code: "unauthorized", message: "refresh token inválido" } });
    }

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, claims.sid))
      .limit(1);

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.refreshTokenHash !== hashToken(parsed.data.refreshToken)
    ) {
      return reply.code(401).send({ error: { code: "session_revoked", message: "sessão encerrada" } });
    }

    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, claims.sub))
      .limit(1);
    if (!user) return reply.code(401).send({ error: { code: "unauthorized", message: "usuário não existe" } });

    // rotate: revoga a sessão antiga e emite uma nova
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));
    return { session: await issueSession(user, session.userAgent ?? undefined) };
  });

  app.post("/v1/auth/logout", { preHandler: app.authenticate }, async (req, reply) => {
    const { sessionId } = app.requireUser(req);
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
    return reply.code(204).send();
  });

  app.get(routes.me, { preHandler: app.authenticate }, async (req) => {
    const user = app.requireUser(req);
    const [counts] = await db
      .select({
        providers: sql<number>`(SELECT count(*)::int FROM ai_providers WHERE user_id = ${user.id})`,
        devices: sql<number>`(SELECT count(*)::int FROM devices WHERE user_id = ${user.id})`,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    return {
      user: { id: user.id, email: user.email, name: user.name },
      counts: { providers: counts?.providers ?? 0, devices: counts?.devices ?? 0 },
    };
  });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** usado pelo pairing e pelo agent token do desktop */
export function newOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
