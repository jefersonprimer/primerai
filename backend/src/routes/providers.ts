import type { FastifyInstance, FastifyReply } from "fastify";
import { CreateProviderSchema, UpdateProviderSchema, routes } from "@primerai/shared";
import { getProviderEntry } from "@primerai/shared";
import type { AiProviderRow } from "../db/schema.js";
import { providersRepo, revealKey, toApi } from "../db/providers.repo.js";
import { baseUrlFor, getAdapter, ProviderError, type ProviderCtx } from "../ai/registry.js";

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: { code: "invalid_body", message } });
}

function notFound(reply: FastifyReply, what: string) {
  return reply.code(404).send({ error: { code: "not_found", message: `${what} não encontrado` } });
}

function toTestError(err: unknown) {
  if (err instanceof ProviderError) {
    return { ok: false as const, code: err.code, message: err.message };
  }
  return {
    ok: false as const,
    code: "unknown" as const,
    message: err instanceof Error ? err.message : "erro desconhecido ao falar com o provider",
  };
}

/**
 * Rotas de provider — é o caminho do modal de API key:
 * criar → validar → descobrir modelos → salvar.
 */
export async function providerRoutes(app: FastifyInstance) {
  const db = app.db;
  const pre = { preHandler: app.authenticate };

  const ctxFor = (row: AiProviderRow): ProviderCtx => ({
    apiKey: revealKey(row, row.provider),
    baseUrl: baseUrlFor(row.provider, row.baseUrl),
  });

  app.get(routes.providers, pre, async (req) => {
    const rows = await providersRepo.list(db, app.requireUser(req).id);
    return { providers: rows.map(toApi) };
  });

  app.post(routes.providers, pre, async (req, reply) => {
    const { id: userId } = app.requireUser(req);
    const parsed = CreateProviderSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.message);

    const entry = getProviderEntry(parsed.data.provider);
    if (entry.keyRequired && !parsed.data.apiKey.trim()) {
      return reply.code(422).send({
        error: { code: "api_key_required", message: `O ${entry.label} precisa de uma API key.` },
      });
    }

    const row = await providersRepo.create(db, userId, parsed.data);
    return reply.code(201).send({ provider: toApi(row) });
  });

  app.get<{ Params: { id: string } }>(`${routes.provider(":id")}`, pre, async (req, reply) => {
    const row = await providersRepo.get(db, app.requireUser(req).id, req.params.id);
    if (!row) return notFound(reply, "provider");
    return { provider: toApi(row) };
  });

  app.patch<{ Params: { id: string } }>(`${routes.provider(":id")}`, pre, async (req, reply) => {
    const parsed = UpdateProviderSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.message);

    const row = await providersRepo.update(db, app.requireUser(req).id, req.params.id, parsed.data);
    if (!row) return notFound(reply, "provider");
    return { provider: toApi(row) };
  });

  app.delete<{ Params: { id: string } }>(`${routes.provider(":id")}`, pre, async (req, reply) => {
    const ok = await providersRepo.remove(db, app.requireUser(req).id, req.params.id);
    if (!ok) return notFound(reply, "provider");
    return reply.code(204).send();
  });

  /** botão "Validar" do modal */
  app.post<{ Params: { id: string } }>(`${routes.providerTest(":id")}`, pre, async (req, reply) => {
    const row = await providersRepo.get(db, app.requireUser(req).id, req.params.id);
    if (!row) return notFound(reply, "provider");

    try {
      const result = await getAdapter(row.provider).validate(ctxFor(row));
      await providersRepo.touch(db, row.id);
      return { result };
    } catch (err) {
      return reply.code(200).send({ result: toTestError(err) });
    }
  });

  /** botão "descobrir modelos" do select */
  app.get<{ Params: { id: string } }>(`${routes.providerModels(":id")}`, pre, async (req, reply) => {
    const row = await providersRepo.get(db, app.requireUser(req).id, req.params.id);
    if (!row) return notFound(reply, "provider");

    try {
      const models = await getAdapter(row.provider).listModels(ctxFor(row));
      return { models: models.slice(0, 300) };
    } catch (err) {
      const mapped = toTestError(err);
      const status = mapped.code === "network_error" ? 502 : 400;
      return reply.code(status).send({ error: { code: mapped.code, message: mapped.message } });
    }
  });
}