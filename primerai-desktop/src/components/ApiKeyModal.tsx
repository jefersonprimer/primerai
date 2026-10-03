import { useState } from "react";
import { PROVIDER_CATALOG, type AIModel, type ProviderId } from "@primerai/shared";
import { ApiError, api, type Session } from "../lib/api";

export interface ApiKeyModalProps {
  /** null = usuário ainda não tem provider nenhum (primeira abertura) */
  initialProvider?: ProviderId | null;
  session: Session;
  onClose: () => void;
}

type Status = "idle" | "saving" | "discovering";

export function ApiKeyModal({ initialProvider = null, session, onClose }: ApiKeyModalProps) {
  const [provider, setProvider] = useState<ProviderId>(initialProvider ?? "openrouter");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState<string>(
    PROVIDER_CATALOG.find((p) => p.id === (initialProvider ?? "openrouter"))!.suggestedModel,
  );
  const [models, setModels] = useState<AIModel[]>([]);
  const [savedProviderId, setSavedProviderId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const entry = PROVIDER_CATALOG.find((p) => p.id === provider)!;

  function pickProvider(next: ProviderId) {
    const picked = PROVIDER_CATALOG.find((p) => p.id === next)!;
    setProvider(next);
    setSavedProviderId(null);
    setModel(picked.suggestedModel);
    setModels([]);
    setError(null);
    setOk(null);
  }

  /** salva a chave e devolve o id — a mesma coisa serve pro submit e pra busca de modelos */
  async function save(): Promise<string> {
    if (savedProviderId) {
      await api.updateProvider(session.accessToken, savedProviderId, {
        apiKey: apiKey.trim(),
        defaultModel: model,
        isDefault: true,
      });
      return savedProviderId;
    }
    const saved = await api.createProvider(session.accessToken, {
      provider,
      apiKey: apiKey.trim(),
      defaultModel: model,
      makeDefault: true,
    });
    setSavedProviderId(saved.id);
    return saved.id;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);

    if (entry.keyRequired && !apiKey.trim()) {
      setError(`O ${entry.label} precisa de uma API key.`);
      return;
    }

    setStatus("saving");
    try {
      const id = await save();

      // valida depois de salvar: se a chave estiver errada o usuário continua
      // logado, só precisa corrigir em Configurações — não preso num modal
      const result = await api.testProvider(session.accessToken, id);
      setOk(result.ok ? result.message : `Chave salva, mas a validação falhou: ${result.message}`);
      if (result.ok) setTimeout(onClose, 800);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "não foi possível falar com o servidor");
    } finally {
      setStatus("idle");
    }
  }

  async function handleDiscoverModels() {
    setError(null);
    setStatus("discovering");
    try {
      // salvar antes de listar é necessário: a chave nunca sai do backend,
      // então o backend precisa tê-la guardada para consultar a API do provider
      const canSave = apiKey.trim().length > 0 || !entry.keyRequired;
      const id = canSave ? await save() : null;

      if (!id) {
        setError("cole a chave antes de descobrir modelos");
        return;
      }

      const discovered = await api.listModels(session.accessToken, id);
      setModels(discovered);
      if (discovered.length === 0) {
        setError("o provider não retornou nenhum modelo");
      } else if (!discovered.some((m) => m.id === model)) {
        setModel(discovered[0]!.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "falha ao buscar modelos");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Conectar sua IA">
      <form className="modal" onSubmit={handleSubmit}>
        <header className="modal-head">
          <h1>Conectar sua IA</h1>
          <p>
            A chave fica cifrada no seu servidor e nunca é compartilhada. Você pode trocar ou
            remover a qualquer momento.
          </p>
        </header>

        <div className="provider-grid">
          {PROVIDER_CATALOG.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`provider-chip${p.id === provider ? " is-active" : ""}`}
              style={{ "--chip-accent": p.accent } as React.CSSProperties}
              onClick={() => pickProvider(p.id)}
              aria-pressed={p.id === provider}
            >
              <span className="provider-chip-name">{p.label}</span>
              <span className="provider-chip-blurb">{p.blurb}</span>
            </button>
          ))}
        </div>

        <label className="field">
          <span className="field-label">{entry.label}</span>
          <div className="field-row">
            <input
              type={showKey || !entry.keyRequired ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={entry.keyPlaceholder}
              spellCheck={false}
              autoComplete="off"
              disabled={!entry.keyRequired}
              autoFocus={entry.keyRequired}
            />
            {entry.keyRequired && (
              <button
                type="button"
                className="ghost"
                onClick={() => setShowKey((v) => !v)}
                title={showKey ? "ocultar" : "mostrar"}
              >
                {showKey ? "🙈" : "👁"}
              </button>
            )}
          </div>
          {entry.keyRequired && (
            <a className="field-hint" href={entry.docsUrl} target="_blank" rel="noreferrer">
              🔗 obter uma chave no {entry.label}
            </a>
          )}
        </label>

        <label className="field">
          <span className="field-label">Modelo</span>
          <div className="field-row">
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              spellCheck={false}
              placeholder={entry.suggestedModel}
            />
            <button
              type="button"
              className="ghost"
              onClick={handleDiscoverModels}
              disabled={status !== "idle"}
              title="buscar modelos com a chave informada"
            >
              {status === "discovering" ? "…" : "↻"}
            </button>
          </div>
          {models.length > 0 && (
            <select
              className="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              aria-label="modelos disponíveis"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.isFree ? " · Free" : ""}
                  {m.contextWindow ? ` · ${Math.round(m.contextWindow / 1000)}k` : ""}
                </option>
              ))}
            </select>
          )}
        </label>

        {error && <p className="alert error">{error}</p>}
        {ok && <p className="alert ok">{ok}</p>}

        <footer className="modal-foot">
          <span className="muted">
            {entry.keyRequired ? "cifrada com AES-256-GCM" : "roda local, sem chave"}
          </span>
          <button type="submit" className="primary" disabled={status === "saving"}>
            {status === "saving" ? "Validando…" : "Validar e continuar"}
          </button>
        </footer>
      </form>
    </div>
  );
}
