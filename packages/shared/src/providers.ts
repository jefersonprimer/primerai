import { z } from "zod";

export const PROVIDER_IDS = ["openai", "google", "openrouter", "ollama"] as const;

export const ProviderIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export interface ProviderCatalogEntry {
  id: ProviderId;
  label: string;
  /** nome exibido no modal */
  blurb: string;
  defaultBaseUrl: string;
  suggestedModel: string;
  /** ollama roda local, então não pede chave */
  keyRequired: boolean;
  keyPlaceholder: string;
  docsUrl: string;
  accent: string;
}

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    id: "openai",
    label: "OpenAI",
    blurb: "GPT-4o, GPT-4.1, o-series. Tool calling nativo.",
    defaultBaseUrl: "https://api.openai.com/v1",
    suggestedModel: "gpt-4o-mini",
    keyRequired: true,
    keyPlaceholder: "sk-…",
    docsUrl: "https://platform.openai.com/api-keys",
    accent: "#10a37f",
  },
  {
    id: "google",
    label: "Google",
    blurb: "Gemini 2.x. Bom custo-benefício e contexto enorme.",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    suggestedModel: "gemini-2.0-flash",
    keyRequired: true,
    keyPlaceholder: "AIza…",
    docsUrl: "https://aistudio.google.com/app/apikey",
    accent: "#4285f4",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    blurb: "Uma chave, todos os modelos (Claude, GPT, Llama, Qwen…).",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    suggestedModel: "anthropic/claude-sonnet-4",
    keyRequired: true,
    keyPlaceholder: "sk-or-v1-…",
    docsUrl: "https://openrouter.ai/keys",
    accent: "#6467f2",
  },
  {
    id: "ollama",
    label: "Ollama",
    blurb: "Modelos locais no seu PC. Sem chave, sem internet.",
    defaultBaseUrl: "http://localhost:11434",
    suggestedModel: "qwen2.5:7b",
    keyRequired: false,
    keyPlaceholder: "(não precisa de chave)",
    docsUrl: "https://ollama.com/library",
    accent: "#8b8b8b",
  },
] as const;

export function getProviderEntry(id: ProviderId): ProviderCatalogEntry {
  const found = PROVIDER_CATALOG.find((p) => p.id === id);
  if (!found) throw new Error(`provider desconhecido: ${id}`);
  return found;
}

/** Como uma chave válida aparece no app: nunca a key inteira, só o começo e o fim. */
export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 10) return "••••••••";
  const head = trimmed.slice(0, 5);
  const tail = trimmed.slice(-4);
  return `${head}…${tail}`;
}

export const AIModelSchema = z.object({
  id: z.string(),
  label: z.string(),
  contextWindow: z.number().int().positive().nullable(),
  supportsTools: z.boolean().default(true),
  /** true quando o provider informa preço zero ou o modelo roda localmente */
  isFree: z.boolean().default(false),
});
export type AIModel = z.infer<typeof AIModelSchema>;

export const AiProviderSchema = z.object({
  id: z.string().uuid(),
  provider: ProviderIdSchema,
  label: z.string(),
  baseUrl: z.string(),
  /** últimos caracteres da key — a key em si nunca volta da API */
  keyHint: z.string(),
  defaultModel: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
export type AiProvider = z.infer<typeof AiProviderSchema>;

export const CreateProviderSchema = z.object({
  provider: ProviderIdSchema,
  apiKey: z.string().max(400).default(""),
  baseUrl: z.string().url().optional(),
  label: z.string().max(60).optional(),
  defaultModel: z.string().max(120).optional(),
  /** primeira chave salva vira automaticamente o provider padrão */
  makeDefault: z.boolean().optional(),
});
export type CreateProviderInput = z.infer<typeof CreateProviderSchema>;

export const UpdateProviderSchema = z.object({
  label: z.string().max(60).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().max(400).optional(),
  defaultModel: z.string().max(120).nullable().optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateProviderInput = z.infer<typeof UpdateProviderSchema>;

export const PROVIDER_ERROR_CODES = [
  "invalid_key",
  "forbidden_model",
  "rate_limited",
  "network_error",
  "unknown",
] as const;
export const ProviderErrorCodeSchema = z.enum(PROVIDER_ERROR_CODES);
export type ProviderErrorCode = z.infer<typeof ProviderErrorCodeSchema>;

export const ProviderTestResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), org: z.string().nullable(), message: z.string() }),
  z.object({ ok: z.literal(false), code: ProviderErrorCodeSchema, message: z.string() }),
]);
export type ProviderTestResult = z.infer<typeof ProviderTestResultSchema>;


/** erro de API padrão, compartilhado por mobile e desktop */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
