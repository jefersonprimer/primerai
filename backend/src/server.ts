import "./env.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { runMigrations } from "./db/migrate.js";

const cfg = loadConfig();
const app = await buildApp();

// schema sempre em dia no boot — em produção quem decide é o deploy,
// mas para self-host o primeiro boot precisa funcionar sem passo manual
await runMigrations(cfg.DATABASE_URL);

try {
  await app.listen({ host: cfg.HOST, port: cfg.PORT });
  app.log.info(`primerai backend em ${cfg.PUBLIC_URL}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} recebido, encerrando`);
    await app.close();
    process.exit(0);
  });
}