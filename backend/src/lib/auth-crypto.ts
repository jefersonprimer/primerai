import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * scrypt (N=2^15) da stdlib. Custo de ~50ms por hash em hardware modesto,
 * o que é aceitável para o MVP e evita uma dependência nativa.
 * Migrar para argon2id quando houver login por web com rate limit apertado.
 */
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 } as const;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT.keylen);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  const salt = Buffer.from(saltB64!, "base64url");
  const expected = Buffer.from(hashB64!, "base64url");
  const derived = await scryptAsync(password, salt, expected.length);

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/* ───────────────────────────── JWT (HS256) ───────────────────────────── */

export interface AccessClaims {
  sub: string;
  sid: string;
  typ: "access";
  exp: number;
  iat: number;
}

export interface RefreshClaims {
  sub: string;
  sid: string;
  typ: "refresh";
  exp: number;
  iat: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: Record<string, unknown>, secret: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function signAccessToken(
  args: { userId: string; sessionId: string; secret: string; ttlSeconds: number },
): string {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: args.userId, sid: args.sessionId, typ: "access", iat: now, exp: now + args.ttlSeconds },
    args.secret,
  );
}

export function signRefreshToken(
  args: { userId: string; sessionId: string; secret: string; ttlSeconds: number },
): string {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: args.userId, sid: args.sessionId, typ: "refresh", iat: now, exp: now + args.ttlSeconds },
    args.secret,
  );
}

export function verifyToken<T>(token: string, secret: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts as [string, string, string];
  const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { exp?: number };
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    return claims as T;
  } catch {
    return null;
  }
}

export function parseDuration(ttl: string, fallbackSeconds: number): number {
  const match = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!match) return fallbackSeconds;
  const value = Number(match[1]);
  const unit = match[2] as "s" | "m" | "h" | "d";
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
  return value * mult;
}