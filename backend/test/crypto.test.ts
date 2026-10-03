import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptSecret, digestArgs, encryptSecret, redact, stableStringify } from "../src/lib/crypto.ts";

process.env.PRIMERAI_MASTER_KEY ??= Buffer.alloc(32, 7).toString("base64");

test("encryptSecret faz roundtrip", () => {
  const secret = "sk-or-v1-abcdefghijklmnopqrstuvwxyz";
  const payload = encryptSecret(secret);

  assert.notEqual(payload, secret);
  assert.ok(payload.startsWith("v1."));
  assert.equal(decryptSecret(payload), secret);
});

test("ciphertext muda a cada chamada (IV aleatório)", () => {
  const a = encryptSecret("mesma-chave");
  const b = encryptSecret("mesma-chave");
  assert.notEqual(a, b);
});

test("payload adulterado é rejeitado pelo auth tag", () => {
  const payload = encryptSecret("secreto");
  const parts = payload.split(".");
  const data = Buffer.from(parts[3]!, "base64url");
  data[0] = data[0]! ^ 0xff;
  parts[3] = data.toString("base64url");

  assert.throws(() => decryptSecret(parts.join(".")));
});

test("formato desconhecido é rejeitado", () => {
  assert.throws(() => decryptSecret("lixo"));
  assert.throws(() => decryptSecret("v2.a.b.c"));
});

test("redact remove segredos conhecidos", () => {
  assert.equal(redact("Bearer sk-abcdefghijklmn"), "Bearer sk-***");
  assert.equal(redact("sk-or-v1-1234567890abcdef"), "sk-or-v1-***");
  assert.equal(redact("x-goog-api-key: AIzaSyABCDEFGHIJK"), "x-goog-api-key: ***");
  assert.equal(redact("x-goog-api-key=AIzaSyABCDEFGHIJK"), "x-goog-api-key=***");
});

test("redact não quebra texto normal", () => {
  const msg = "criei a pasta Trabalho com 3 arquivos";
  assert.equal(redact(msg), msg);
});

test("stableStringify é independente da ordem das chaves", () => {
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
  assert.equal(stableStringify({ a: [1, { z: 1, y: 2 }] }), stableStringify({ a: [1, { y: 2, z: 1 }] }));
});

test("digestArgs é estável e curto", () => {
  const d = digestArgs({ path: "/tmp/a", recursive: true });
  assert.equal(d, digestArgs({ recursive: true, path: "/tmp/a" }));
  assert.notEqual(d, digestArgs({ path: "/tmp/b", recursive: true }));
  assert.equal(d.length, 16);
});