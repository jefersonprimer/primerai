import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { AIModel, AiProvider } from "@primerai/shared";
import { api } from "../lib/api";

export interface ModelPickerProps {
  visible: boolean;
  provider: AiProvider | undefined;
  selected: string | undefined;
  accessToken: string | undefined;
  onClose: () => void;
  onSelect: (model: string) => void;
}

function describe(model: AIModel): string {
  const context = model.contextWindow ? ` · ${Math.round(model.contextWindow / 1000)}k` : "";
  return `${model.label}${model.isFree ? " · Free" : ""}${context}`;
}

export function ModelPicker({ visible, provider, selected, accessToken, onClose, onSelect }: ModelPickerProps) {
  const [models, setModels] = useState<AIModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const withoutProvider = !provider || !accessToken;
  const loading = !withoutProvider && models === null && error === null;

  useEffect(() => {
    if (!visible || !provider || !accessToken) return;
    let cancelled = false;
    void api
      .listModels(accessToken, provider.id)
      .then((list) => { if (!cancelled) setModels(list); })
      .catch((err) => {
        if (cancelled) return;
        setModels([]);
        setError(err instanceof Error ? err.message : "não foi possível listar os modelos");
      });
    return () => { cancelled = true; };
  }, [visible, provider, accessToken]);

  function reset() {
    setModels(null);
    setError(null);
    setManual("");
  }

  function close() {
    reset();
    onClose();
  }

  function choose(model: string) {
    reset();
    onSelect(model);
  }

  if (!visible) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <section className="settings-dialog model-picker" role="dialog" aria-modal="true" aria-labelledby="model-picker-title">
        <div className="model-picker-head">
          <h2 id="model-picker-title">Modelo</h2>
          {provider && <span className="model-provider-badge">{provider.label}</span>}
          <button className="ghost model-picker-close" onClick={close} aria-label="Fechar"><X size={16} /></button>
        </div>
        <p className="muted">Escolha o modelo para esta conversa</p>
        {loading && <p className="muted">Carregando modelos…</p>}
        {!loading && error && <p className="alert error">{error}</p>}
        {!provider && <p className="muted">Nenhum provider de IA configurado.</p>}
        {provider && !accessToken && <p className="muted">Entre na sua conta para listar os modelos.</p>}
        {!loading && !error && !withoutProvider && models?.length === 0 && (
          <p className="muted">Nenhum modelo disponível. Digite o id abaixo.</p>
        )}
        {models !== null && models.length > 0 && (
          <div className="model-list">
            {models.map((model) => {
              const isSelected = model.id === selected;
              return (
                <button key={model.id} className={`model-option${isSelected ? " selected" : ""}`} onClick={() => choose(model.id)}>
                  <span>{describe(model)}</span>
                  {isSelected && <Check size={16} />}
                </button>
              );
            })}
          </div>
        )}
        <div className="model-manual">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="ou digite o id do modelo" />
          <button className="primary" disabled={!manual.trim()} onClick={() => choose(manual.trim())}>Usar</button>
        </div>
      </section>
    </div>
  );
}
