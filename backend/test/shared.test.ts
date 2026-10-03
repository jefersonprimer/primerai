import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CreateProviderSchema,
  PROVIDER_CATALOG,
  TOOL_CATALOG,
  getProviderEntry,
  getToolSpec,
  maskApiKey,
  routes,
} from "@primerai/shared";

test("catálogo de providers cobre openai, google, openrouter, ollama", () => {
  assert.deepEqual(
    PROVIDER_CATALOG.map((p) => p.id),
    ["openai", "google", "openrouter", "ollama"],
  );
  for (const entry of PROVIDER_CATALOG) {
    assert.ok(entry.defaultBaseUrl.startsWith("http"), `${entry.id} sem baseUrl`);
    assert.ok(entry.suggestedModel.length > 0, `${entry.id} sem modelo sugerido`);
  }
  assert.equal(getProviderEntry("ollama").keyRequired, false);
  assert.equal(getProviderEntry("openai").keyRequired, true);
});

test("provider desconhecido falha alto", () => {
  assert.throws(() => getProviderEntry("cohere" as never));
});

test("maskApiKey mostra começo e fim, nunca o meio", () => {
  const masked = maskApiKey("sk-or-v1-1234567890abcdefghijklmnop");
  assert.ok(masked.includes("…"));
  assert.ok(masked.endsWith("mnop"));
  assert.ok(!masked.includes("1234567890"));
});

test("maskApiKey não revela chaves curtas", () => {
  assert.equal(maskApiKey("curta"), "••••••••");
});

test("CreateProviderSchema rejeita provider fora do catálogo", () => {
  assert.equal(CreateProviderSchema.safeParse({ provider: "openai", apiKey: "sk-x" }).success, true);
  assert.equal(CreateProviderSchema.safeParse({ provider: "cohere", apiKey: "sk-x" }).success, false);
});

test("CreateProviderSchema limita tamanho da key e da baseUrl", () => {
  assert.equal(CreateProviderSchema.safeParse({ provider: "openai", apiKey: "x".repeat(500) }).success, false);
  assert.equal(
    CreateProviderSchema.safeParse({ provider: "openai", apiKey: "k", baseUrl: "não é url" }).success,
    false,
  );
});

test("toda tool do catálogo tem nome, descrição, risco e schema de params", () => {
  for (const tool of TOOL_CATALOG) {
    assert.ok(tool.name.includes("."), `nome de tool deve ter namespace: ${tool.name}`);
    assert.ok(tool.description.length > 10, `${tool.name} sem descrição útil`);
    assert.ok(["safe", "confirm", "blocked"].includes(tool.risk));
    assert.equal((tool.parameters as { type?: string }).type, "object");
  }
});

test("tools destrutivas nunca são 'safe'", () => {
  for (const name of ["fs.delete_path", "shell.execute", "fs.move_file", "app.open"] as const) {
    assert.notEqual(getToolSpec(name).risk, "safe", `${name} deveria exigir confirmação`);
  }
});

test("nomes de tool são únicos", () => {
  const names = TOOL_CATALOG.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
});

test("routes de provider batem com a tabela do mvp.md", () => {
  assert.equal(routes.providers, "/v1/providers");
  assert.equal(routes.provider("abc"), "/v1/providers/abc");
  assert.equal(routes.providerTest("abc"), "/v1/providers/abc/test");
  assert.equal(routes.providerModels("abc"), "/v1/providers/abc/models");
});