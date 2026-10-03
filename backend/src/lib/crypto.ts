import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const candidate of [path.join(here, "../../.env"), path.join(here, "../../../.env")]) {
  loadDotenv({ path: candidate, override: false, quiet: true });
}

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

let masterKey: Buffer | null = null;

export function getMasterKey(): Buffer {
  if (masterKey) return masterKey;

  const raw = process.env.PRIMERAI_MASTER_KEY;
  if (!raw) {
    throw new Error("PRIMERAI_MASTER_KEY ausente — gere com: openssl rand -base64 32");
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `PRIMERAI_MASTER_KEY precisa ter 32 bytes; essa tem ${key.length}. Gere com: openssl rand -base64 32`,
    );
  }

  masterKey = key;
  return key;
}

/** Formato: v1.<iv b64u>.<tag b64u>.<ciphertext b64u> */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getMasterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(
    ".",
  );
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("payload cifrado em formato desconhecido");
  }

  const iv = Buffer.from(parts[1]!, "base64url");
  const tag = Buffer.from(parts[2]!, "base64url");
  const data = Buffer.from(parts[3]!, "base64url");

  const decipher = createDecipheriv(ALGO, getMasterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * Digest de argumentos para o audit_log. Guardamos o hash em vez do argumento
 * cru: dá pra provar o que foi pedido sem guardar conteúdo do usuário (e sem
 * vazar segredo que a IA tenha colocado no comando).
 */
export function digestArgs(args: unknown): string {
  return createHashOf(stableStringify(args));
}

function createHashOf(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** Redige segredos antes de qualquer log. Ordem importa: sk-or-v1 antes de sk-. */
export function redact(text: string): string {
  return text
    .replace(/sk-or-v1-[A-Za-z0-9]{8,}/g, "sk-or-v1-***")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/AIza[A-Za-z0-9_-]{10,}/g, "AIza***")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1***")
    .replace(/(x-goog-api-key[:=]\s*)\S+/gi, "$1***");
}