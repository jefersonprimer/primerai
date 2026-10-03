import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { AppConfig } from "../config.js";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(cfg: AppConfig) {
  const client = postgres(cfg.DATABASE_URL, {
    max: 10,
    onnotice: () => {},
  });
  return drizzle(client, { schema });
}