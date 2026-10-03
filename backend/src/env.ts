import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

// .env do backend primeiro, depois o da raiz do monorepo (onde docker-compose lê)
for (const candidate of [path.join(here, "../.env"), path.join(repoRoot, ".env")]) {
  loadDotenv({ path: candidate, override: false, quiet: true });
}