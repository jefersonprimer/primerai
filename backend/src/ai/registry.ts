import { getProviderEntry, type AIModel, type ProviderErrorCode, type ProviderId } from "@primerai/shared";
import { redact } from "../lib/crypto.js";

export interface ProviderCtx {
  apiKey: string;
  baseUrl: string;
  model?: string | undefined;
  signal?: AbortSignal | undefined;
}

export interface ValidateOk {
  ok: true;
  org: string | null;
  message: string;
}
export interface ValidateErr {
  ok: false;
  code: ProviderErrorCode;
  message: string;
}
export type ValidateResult = ValidateOk | ValidateErr;

export interface AIProviderAdapter {
  readonly id: ProviderId;
  /** true se o adapter fala a dialect OpenAI — reaproveita o client de chat */
  readonly openAiCompatible: boolean;
  validate(ctx: ProviderCtx): Promise<ValidateResult>;
  listModels(ctx: ProviderCtx): Promise<AIModel[]>;
}

const TIMEOUT_MS = 20_000;
const MAX_ERROR_BODY = 600;

/** Erro de provider já normalizado, pronto pra virar resposta de API. */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

async function request(
  url: string,
  init: RequestInit,
  timeoutMs = TIMEOUT_MS,
): Promise<{ status: number; ok: boolean; text: string; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;

  let res: Response;
  try {
    res = await fetch(url, { ...init, signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new ProviderError("network_error", `timeout de ${timeoutMs}ms ao chamar ${safeHost(url)}`);
    }
    throw new ProviderError("network_error", `não foi possível alcançar ${safeHost(url)}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { status: res.status, ok: res.ok, text, json };
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "o provider";
  }
}

/** Extrai a mensagem de erro mais útil possível de uma resposta de provider. */
function errorMessage(json: unknown, text: string, fallback: string): string {
  const body = json as Record<string, unknown> | null;

  const candidates: unknown[] = [
    body?.error,
    (body as { message?: unknown })?.message,
    (body as { error?: { message?: unknown } })?.error?.message,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return redact(candidate.trim());
    if (candidate && typeof candidate === "object") {
      const msg = (candidate as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim()) return redact(msg.trim());
    }
  }

  if (text.trim()) return redact(text.slice(0, MAX_ERROR_BODY));
  return fallback;
}

/** 401/403 → chave inválida ou sem permissão; 429 → rate limit. */
function mapStatus(status: number, json: unknown, text: string, providerLabel: string): ProviderError {
  const detail = errorMessage(json, text, `HTTP ${status}`);

  if (status === 401 || status === 403) {
    const looksLikePermission = /permission|model|access|forbidden/i.test(detail);
    return new ProviderError(
      looksLikePermission ? "forbidden_model" : "invalid_key",
      looksLikePermission
        ? `chave sem permissão para este modelo (${detail})`
        : `chave inválida ou expirada no ${providerLabel} (${detail})`,
      status,
    );
  }

  if (status === 429) {
    return new ProviderError("rate_limited", `${providerLabel} pediu rate limit, tente em instantes`, status);
  }

  if (status >= 500) {
    return new ProviderError("network_error", `${providerLabel} está indisponível (HTTP ${status})`, status);
  }

  return new ProviderError("unknown", `${providerLabel}: ${detail}`, status);
}

function trimBase(base: string): string {
  return base.replace(/\/+$/, "");
}

/* ────────────────────────────── OpenAI ────────────────────────────── */

const openai: AIProviderAdapter = {
  id: "openai",
  openAiCompatible: true,

  async validate(ctx) {
    const base = trimBase(ctx.baseUrl);
    const { status, ok, text, json } = await request(`${base}/models`, {
      headers: { Authorization: `Bearer ${ctx.apiKey}` },
    });
    if (!ok) throw mapStatus(status, json, text, "OpenAI");

    const data = (json as { data?: { id?: string; owned_by?: string }[] })?.data ?? [];
    const org =
      (json as { openai_organization?: string })?.openai_organization ??
      data.find((m) => m.owned_by)?.owned_by ??
      null;

    return { ok: true, org, message: `Chave válida — ${data.length} modelo(s) disponíveis.` };
  },

  async listModels(ctx) {
    const base = trimBase(ctx.baseUrl);
    const { status, ok, text, json } = await request(`${base}/models`, {
      headers: { Authorization: `Bearer ${ctx.apiKey}` },
    });
    if (!ok) throw mapStatus(status, json, text, "OpenAI");

    const data = (json as { data?: { id?: string; owned_by?: string }[] })?.data ?? [];
    return data
      .filter((m): m is { id: string; owned_by?: string } => typeof m.id === "string")
      .map((m) => ({
        id: m.id,
        label: m.id,
        contextWindow: null,
        supportsTools: !/embedding|whisper|tts|moderation|audio|realtime|dall-e|image/i.test(m.id),
        isFree: false,
      }));
  },
};

/* ───────────────────────────── Google ────────────────────────────── */

const google: AIProviderAdapter = {
  id: "google",
  openAiCompatible: false,

  async validate(ctx) {
    const models = await this.listModels(ctx);
    return { ok: true, org: null, message: `Chave válida — ${models.length} modelo(s) disponíveis.` };
  },

  async listModels(ctx) {
    const base = trimBase(ctx.baseUrl);
    const { status, ok, text, json } = await request(`${base}/models?pageSize=200`, {
      headers: { "x-goog-api-key": ctx.apiKey },
    });
    if (!ok) throw mapStatus(status, json, text, "Google");

    const models = (json as { models?: { name?: string; displayName?: string; inputTokenLimit?: number }[] })
      ?.models ?? [];

    return models
      .filter((m): m is { name: string; displayName?: string; inputTokenLimit?: number } =>
        typeof m.name === "string",
      )
      // só os que servem pra chat, sem tuning/embedding/file-api
      .filter((m) => /\/models\/(gemini|learnlm)/.test(m.name))
      .map((m) => ({
        id: m.name.replace(/^models\//, ""),
        label: m.displayName ?? m.name.replace(/^models\//, ""),
        contextWindow: m.inputTokenLimit ?? null,
        supportsTools: /gemini/.test(m.name),
        isFree: false,
      }));
  },
};

/* ────────────────────────── OpenRouter ────────────────────────── */

const openrouter: AIProviderAdapter = {
  id: "openrouter",
  openAiCompatible: true,

  async validate(ctx) {
    const base = trimBase(ctx.baseUrl);
    const { status, ok, text, json } = await request(`${base}/key`, {
      headers: {
        Authorization: `Bearer ${ctx.apiKey}`,
        "HTTP-Referer": "https://github.com/primerai/primerai",
        "X-Title": "PrimerAI",
      },
    });
    if (!ok) throw mapStatus(status, json, text, "OpenRouter");

    const body = json as { data?: { label?: string; limit_remaining?: number | null } } | null;
    const label = body?.data?.label ?? null;
    const remaining = body?.data?.limit_remaining;

    return {
      ok: true,
      org: label,
      message:
        typeof remaining === "number"
          ? `Chave válida (${label ?? "openrouter"}). Créditos restantes: ${remaining}.`
          : `Chave válida${label ? ` (${label})` : ""}.`,
    };
  },

  async listModels(ctx) {
    const base = trimBase(ctx.baseUrl);
    const { status, ok, text, json } = await request(`${base}/models`, {
      headers: {
        Authorization: `Bearer ${ctx.apiKey}`,
        "HTTP-Referer": "https://github.com/primerai/primerai",
        "X-Title": "PrimerAI",
      },
    });
    if (!ok) throw mapStatus(status, json, text, "OpenRouter");

    const data =
      (json as {
        data?: {
          id?: string;
          name?: string;
          context_length?: number;
          supported_parameters?: string[];
          pricing?: { prompt?: string; completion?: string };
        }[];
      })?.data ?? [];

    return data
      .flatMap((m) => (typeof m.id === "string" ? [{
        id: m.id,
        name: m.name,
        contextLength: m.context_length,
        tools: m.supported_parameters ?? [],
        pricing: m.pricing,
      }] : []))
      .map((m) => ({
        id: m.id,
        label: m.name ?? m.id,
        contextWindow: m.contextLength ?? null,
        supportsTools: m.tools.includes("tools"),
        isFree:
          typeof m.pricing?.prompt === "string" &&
          Number(m.pricing.prompt) === 0 &&
          typeof m.pricing?.completion === "string" &&
          Number(m.pricing.completion) === 0,
      }))
      // A rota limita a resposta a 300 modelos; prioriza os gratuitos para
      // que eles não desapareçam atrás do corte alfabético.
      .sort((a, b) => Number(b.isFree) - Number(a.isFree) || a.label.localeCompare(b.label));
  },
};

/* ──────────────────────────── Ollama ──────────────────────────── */

const ollama: AIProviderAdapter = {
  id: "ollama",
  openAiCompatible: true,

  async validate(ctx) {
    const base = trimBase(ctx.baseUrl);
    const { status, ok, text, json } = await request(`${base}/api/tags`, {});
    if (!ok) throw mapStatus(status, json, text, "Ollama");

    const models = (json as { models?: unknown[] })?.models ?? [];
    return {
      ok: true,
      org: null,
      message: `Ollama respondendo — ${models.length} modelo(s) local(is).`,
    };
  },

  async listModels(ctx) {
    const base = trimBase(ctx.baseUrl);
    const { status, ok, text, json } = await request(`${base}/api/tags`, {});
    if (!ok) throw mapStatus(status, json, text, "Ollama");

    const models = (json as { models?: { name?: string; model?: string }[] })?.models ?? [];
    return models
      .map((m) => m.name ?? m.model)
      .filter((n): n is string => typeof n === "string")
      .map((n) => ({ id: n, label: n, contextWindow: null, supportsTools: true, isFree: true }));
  },
};

const registry: Record<ProviderId, AIProviderAdapter> = {
  openai,
  google,
  openrouter,
  ollama,
};

export function getAdapter(id: ProviderId): AIProviderAdapter {
  return registry[id];
}

export function baseUrlFor(id: ProviderId, override?: string): string {
  return override?.trim() || getProviderEntry(id).defaultBaseUrl;
}
