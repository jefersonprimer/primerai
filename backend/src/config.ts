import "./env.js";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  PUBLIC_URL: z.string().url().default("http://localhost:8787"),
  CORS_ORIGIN: z.string().default("http://localhost:1420,http://localhost:8081"),
  PRIMERAI_MASTER_KEY: z
    .string()
    .min(1, "PRIMERAI_MASTER_KEY é obrigatório — gere com: openssl rand -base64 32"),
  JWT_SECRET: z.string().default("dev-only-change-me"),
  JWT_REFRESH_SECRET: z.string().default("dev-only-change-me-too"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  AI_MAX_TOOL_ITERATIONS: z.coerce.number().int().min(1).max(50).default(12),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuração inválida:\n${issues}\n\nCopie .env.example para .env e preencha.`);
  }

  // a master key precisa ter 32 bytes de verdade, senão o AES-GCM falha mais tarde
  // na hora de cifrar a primeira chave de provider — erro difícil de diagnosticar.
  const keyBuf = Buffer.from(parsed.data.PRIMERAI_MASTER_KEY, "base64");
  if (parsed.data.NODE_ENV === "production" && keyBuf.length !== 32) {
    throw new Error("PRIMERAI_MASTER_KEY precisa ter exatamente 32 bytes (base64).");
  }
  if (parsed.data.NODE_ENV === "production") {
    if (parsed.data.JWT_SECRET.startsWith("dev-only")) {
      throw new Error("JWT_SECRET precisa ser definido em produção.");
    }
  }

  cached = parsed.data;
  return cached;
}

export function corsOrigins(cfg: AppConfig): string[] {
  return cfg.CORS_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}