import "../env.js";
/**
 * Runner de migrations: aplica os .sql em drizzle/ na ordem, registrando o que já
 * rodou. Simples de propósito — em produção o backend faz isso no boot.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadConfig } from "../config.js";

const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS _migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

export async function runMigrations(databaseUrl: string, dir?: string) {
  const dirPath = dir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const db = drizzle(sql);

  try {
    await sql.unsafe(MIGRATIONS_TABLE);

    const files = (await readdir(dirPath)).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
      const [existing] = await sql<{ name: string }[]>`
        SELECT name FROM _migrations WHERE name = ${file}
      `;
      if (existing) {
        console.log(`  skip  ${file}`);
        continue;
      }

      const statements = splitStatements(await readFile(path.join(dirPath, file), "utf8"));
      console.log(`  apply ${file} (${statements.length} statements)`);
      await sql.begin(async (tx) => {
        for (const statement of statements) {
          await tx.unsafe(statement);
        }
        await tx`INSERT INTO _migrations (name) VALUES (${file})`;
      });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
  void db;
}

/** quebra o arquivo em statements respeitando $$ ... $$ (funções/triggers) */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inDollar = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    buf += ch;

    if (ch === "$" && sql[i + 1] === "$") {
      inDollar = !inDollar;
      i++;
      buf += "$";
      continue;
    }

    if (ch === ";" && !inDollar) {
      const stmt = buf.trim();
      if (stmt && stmt !== ";") out.push(stmt);
      buf = "";
    }
  }

  const last = buf.trim();
  if (last) out.push(last);
  return out;
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  const cfg = loadConfig();
  console.log(`migrando ${new URL(cfg.DATABASE_URL).host}`);
  await runMigrations(cfg.DATABASE_URL);
  console.log("ok");
  process.exit(0);
}