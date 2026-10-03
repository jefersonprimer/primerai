import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashPassword,
  parseDuration,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyToken,
  type AccessClaims,
  type RefreshClaims,
} from "../src/lib/auth-crypto.ts";

const SECRET = "segredo-de-teste-com-tamanho-razoavel";
const secret = SECRET.padEnd(32, "x");

test("scrypt roundtrip", async () => {
  const hash = await hashPassword("superSenha123");
  assert.ok(hash.startsWith("scrypt$"));
  assert.ok(await verifyPassword("superSenha123", hash));
  assert.equal(await verifyPassword("senhaErrada", hash), false);
});

test("hash do mesmo password nunca é igual (salt aleatório)", async () => {
  const a = await hashPassword("mesma");
  const b = await hashPassword("mesma");
  assert.notEqual(a, b);
  assert.ok(await verifyPassword("mesma", a));
  assert.ok(await verifyPassword("mesma", b));
});

test("hash corrompido não autentica", async () => {
  assert.equal(await verifyPassword("x", "lixo"), false);
  assert.equal(await verifyPassword("x", `bcrypt$1$2$3$4$5`), false);
});

test("JWT assina e valida", () => {
  const token = signAccessToken({ userId: "u1", sessionId: "s1", secret, ttlSeconds: 60 });
  const claims = verifyToken<AccessClaims>(token, secret);

  assert.equal(claims?.sub, "u1");
  assert.equal(claims?.typ, "access");
  assert.ok((claims?.exp ?? 0) > Date.now() / 1000);
});

test("JWT com secret diferente é rejeitado", () => {
  const token = signAccessToken({ userId: "u1", sessionId: "s1", secret, ttlSeconds: 60 });
  assert.equal(verifyToken(token, "outro-secret-qualquer-32-bytes-aqui"), null);
});

test("JWT adulterado é rejeitado", () => {
  const token = signAccessToken({ userId: "u1", sessionId: "s1", secret, ttlSeconds: 60 });
  const [h, b, s] = token.split(".") as [string, string, string];
  const body = Buffer.from(b, "base64url").toString("utf8").replace('"u1"', '"u2"');
  assert.equal(verifyToken(`${h}.${Buffer.from(body).toString("base64url")}.${s}`, secret), null);
});

test("JWT expirado é rejeitado", () => {
  const token = signAccessToken({ userId: "u1", sessionId: "s1", secret, ttlSeconds: -10 });
  assert.equal(verifyToken(token, secret), null);
});

test("access e refresh não se misturam", () => {
  const refresh = signRefreshToken({ userId: "u1", sessionId: "s1", secret, ttlSeconds: 60 });
  const claims = verifyToken<RefreshClaims>(refresh, secret);
  assert.equal(claims?.typ, "refresh");
});

test("parseDuration entende s/m/h/d", () => {
  assert.equal(parseDuration("15m", 0), 900);
  assert.equal(parseDuration("30d", 0), 2592000);
  assert.equal(parseDuration("2h", 0), 7200);
  assert.equal(parseDuration("45s", 0), 45);
  assert.equal(parseDuration("lixo", 99), 99);
});