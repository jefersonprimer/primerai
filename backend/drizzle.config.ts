import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://primerai:senha@localhost:5432/primerai",
  },
  verbose: true,
  strict: true,
} satisfies Config;