import "./env.js";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { corsOrigins, loadConfig } from "./config.js";
import { createDatabase, type Database } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { providerRoutes } from "./routes/providers.js";
import { conversationRoutes } from "./routes/conversations.js";
import { taskRoutes } from "./routes/tasks.js";
import { agentRoutes } from "./routes/agent.js";
import { memoryRoutes } from "./routes/memories.js";
import { automationRoutes } from "./routes/automations.js";
import { missionRoutes } from "./routes/missions.js";
import { notionRoutes } from "./routes/notion.js";
import { calendarRoutes } from "./routes/calendar.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const cfg = loadConfig();

  const app = Fastify({
    bodyLimit: 18_000_000,
    logger: {
      level: process.env.LOG_LEVEL ?? (cfg.NODE_ENV === "production" ? "info" : "debug"),
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body.apiKey",
          "body.apiKey",
          "*.apiKey",
        ],
        censor: "[redacted]",
      },
    },
    trustProxy: true,
  });

  const db = createDatabase(cfg);
  app.decorate("db", db);

  await app.register(cors, {
    origin: corsOrigins(cfg),
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    // limite mais apertado no login, pra não ser alvo de brute force
    keyGenerator: (req) => `${req.ip}`,
  });

  await app.register(authPlugin);

  app.get("/v1/health", async () => {
    await db.execute("select 1");
    return { status: "ok", version: "0.1.0", env: cfg.NODE_ENV };
  });

  await app.register(authRoutes);
  await app.register(providerRoutes);
  await app.register(conversationRoutes);
  await app.register(memoryRoutes);
  await app.register(taskRoutes);
  await app.register(automationRoutes);
  await app.register(missionRoutes);
  await app.register(notionRoutes);
  await app.register(calendarRoutes);
  await app.register(agentRoutes);

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: { code: "not_found", message: `rota ${req.method} ${req.url} não existe` } });
  });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    req.log.error({ err }, "erro não tratado");
    const status = err.statusCode ?? 500;
    reply.code(status).send({
      error: {
        code: err.code ?? "internal_error",
        message: status >= 500 ? "erro interno" : err.message,
      },
    });
  });

  return app;
}
