import { useState } from "react";
import { AlertCircle, X } from "lucide-react";
import type { AiProvider, MemorySettings, MemorySuggestion } from "@primerai/shared";
import type { Session } from "../lib/api";
import { ApiKeyModal } from "./ApiKeyModal";

export type SettingsSection =
  | "geral"
  | "integracoes"
  | "providers"
  | "pastas"
  | "memoria";

type WorkspaceItem = { label: string; path: string; enabled: boolean };
type MemoryItem = {
  key: string;
  value: string;
  category?: string;
  createdAt: string;
};

const SETTINGS_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "geral", label: "Geral" },
  { id: "integracoes", label: "Integrações" },
  { id: "providers", label: "Providers" },
  { id: "pastas", label: "Pastas autorizadas" },
  { id: "memoria", label: "Memória da IA" },
];

export interface SettingsModalProps {
  session: Session;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onClose: () => void;
  onProviderSaved: () => void | Promise<void>;
  onLoadMemories: () => void | Promise<void>;
  providers: AiProvider[];
  onRemoveProvider: (id: string) => void | Promise<void>;

  notion: { connected: boolean; workspaceName: string | null } | null;
  notionBusy: boolean;
  notionMessage: string | null;
  onConnectNotion: () => void | Promise<void>;
  onDisconnectNotion: () => void | Promise<void>;
  onRefreshNotion: () => void | Promise<void>;

  calendar: { connected: boolean; calendarId: string | null } | null;
  calendarBusy: boolean;
  calendarMessage: string | null;
  onConnectCalendar: () => void | Promise<void>;
  onDisconnectCalendar: () => void | Promise<void>;
  onRefreshCalendar: () => void | Promise<void>;

  workspaceItems: WorkspaceItem[];
  workspaceLabel: string;
  workspacePath: string;
  onWorkspaceLabelChange: (value: string) => void;
  onWorkspacePathChange: (value: string) => void;
  onRemoveWorkspace: (path: string) => void | Promise<void>;
  onSuggestWorkspaces: () => void | Promise<void>;
  onSaveWorkspaces: () => void | Promise<void>;

  memorySettings: MemorySettings;
  memorySuggestions: MemorySuggestion[];
  memories: MemoryItem[];
  memoryKey: string;
  memoryValue: string;
  memoryCategory: string;
  memoryError: string | null;
  onMemoryKeyChange: (value: string) => void;
  onMemoryValueChange: (value: string) => void;
  onMemoryCategoryChange: (value: string) => void;
  onUpdateMemorySetting: (patch: Partial<MemorySettings>) => void | Promise<void>;
  onAcceptMemorySuggestion: (id: string) => void | Promise<void>;
  onDismissMemorySuggestion: (id: string) => void | Promise<void>;
  onDeleteMemory: (key: string) => void | Promise<void>;
  onClearAllMemories: () => void | Promise<void>;
  onSaveMemory: () => void | Promise<void>;
  onEditMemory: (item: MemoryItem) => void;
}

export function SettingsModal({
  session,
  section,
  onSectionChange,
  onClose,
  onProviderSaved,
  onLoadMemories,
  providers,
  onRemoveProvider,
  notion,
  notionBusy,
  notionMessage,
  onConnectNotion,
  onDisconnectNotion,
  onRefreshNotion,
  calendar,
  calendarBusy,
  calendarMessage,
  onConnectCalendar,
  onDisconnectCalendar,
  onRefreshCalendar,
  workspaceItems,
  workspaceLabel,
  workspacePath,
  onWorkspaceLabelChange,
  onWorkspacePathChange,
  onRemoveWorkspace,
  onSuggestWorkspaces,
  onSaveWorkspaces,
  memorySettings,
  memorySuggestions,
  memories,
  memoryKey,
  memoryValue,
  memoryCategory,
  memoryError,
  onMemoryKeyChange,
  onMemoryValueChange,
  onMemoryCategoryChange,
  onUpdateMemorySetting,
  onAcceptMemorySuggestion,
  onDismissMemorySuggestion,
  onDeleteMemory,
  onClearAllMemories,
  onSaveMemory,
  onEditMemory,
}: SettingsModalProps) {
  const [providerToDelete, setProviderToDelete] = useState<string | null>(null);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="settings-dialog settings-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Seções de configurações">
            <div className="settings-nav-head">
              <h2 id="settings-title">Configurações</h2>
              <button
                className="ghost settings-close"
                onClick={onClose}
                aria-label="Fechar"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {SETTINGS_SECTIONS.map((item) => (
              <button
                key={item.id}
                className={`settings-nav-item${section === item.id ? " active" : ""}`}
                aria-current={section === item.id ? "page" : undefined}
                onClick={() => {
                  onSectionChange(item.id);
                  if (item.id === "memoria") void onLoadMemories();
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {section === "geral" && (
              <>
                <div className="account-header">
                  <span className="account-avatar large" aria-hidden="true">
                    {(
                      session.user.name?.trim()?.[0] ??
                      session.user.email?.[0] ??
                      "?"
                    ).toUpperCase()}
                  </span>
                  <div>
                    <h3>{session.user.name?.trim() || "Conta"}</h3>
                    <p className="muted">{session.user.email}</p>
                  </div>
                </div>
                <p className="muted">
                  Conversas, memórias e integrações ficam sincronizadas com esta
                  conta em todos os seus dispositivos.
                </p>
              </>
            )}

            {section === "integracoes" && (
              <>
                <p className="muted">
                  Conecte serviços para que a IA crie notas e eventos para você.
                </p>
                <div className="notion-account-option">
                  <strong>Notion</strong>
                  <span>
                    {notion?.connected
                      ? `Conectado${notion.workspaceName ? ` · ${notion.workspaceName}` : ""}`
                      : "Conecte para criar notas com a IA"}
                  </span>
                  {notionMessage && (
                    <span className="form-status" role="status">
                      {notionMessage}
                    </span>
                  )}
                  <div>
                    <button
                      className="ghost account-option"
                      disabled={notionBusy}
                      onClick={() =>
                        void (notion?.connected
                          ? onDisconnectNotion()
                          : onConnectNotion())
                      }
                    >
                      {notionBusy
                        ? "Aguarde…"
                        : notion?.connected
                          ? "Desconectar"
                          : "Conectar Notion"}
                    </button>
                    <button
                      className="ghost account-option"
                      disabled={notionBusy}
                      onClick={() => void onRefreshNotion()}
                    >
                      Atualizar status
                    </button>
                  </div>
                </div>
                <div className="notion-account-option">
                  <strong>Google Calendar</strong>
                  <span>
                    {calendar?.connected
                      ? "Conectado · peça à IA para criar eventos"
                      : "Conecte para agendar eventos com a IA"}
                  </span>
                  {calendarMessage && (
                    <span className="form-status" role="status">
                      {calendarMessage}
                    </span>
                  )}
                  <div>
                    <button
                      className="ghost account-option"
                      disabled={calendarBusy}
                      onClick={() =>
                        void (calendar?.connected
                          ? onDisconnectCalendar()
                          : onConnectCalendar())
                      }
                    >
                      {calendarBusy
                        ? "Aguarde…"
                        : calendar?.connected
                          ? "Desconectar"
                          : "Conectar Google Calendar"}
                    </button>
                    <button
                      className="ghost account-option"
                      disabled={calendarBusy}
                      onClick={() => void onRefreshCalendar()}
                    >
                      Atualizar status
                    </button>
                  </div>
                </div>
              </>
            )}

            {section === "providers" && (
              <>
                {providers.length > 0 && (
                  <>
                    <p className="muted">
                      O provider marcado como padrão é usado por novas conversas.
                    </p>
                    <ul className="provider-list">
                      {providers.map((p) => (
                        <li key={p.id}>
                          <span
                            className="dot"
                            style={{
                              background: p.isDefault
                                ? "var(--accent)"
                                : "var(--border)",
                            }}
                            aria-hidden="true"
                          />
                          <span>
                            <strong>{p.label}</strong>
                            {p.isDefault ? " · padrão" : ""}
                            <br />
                            <code>{p.keyHint}</code>
                            {p.defaultModel ? <> · {p.defaultModel}</> : null}
                          </span>
                          {providerToDelete === p.id ? (
                            <>
                              <button
                                className="ghost"
                                onClick={() => {
                                  setProviderToDelete(null);
                                  void onRemoveProvider(p.id);
                                }}
                              >
                                Confirmar remoção
                              </button>
                              <button
                                className="ghost"
                                onClick={() => setProviderToDelete(null)}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              className="ghost"
                              onClick={() => setProviderToDelete(p.id)}
                            >
                              Remover
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <ApiKeyModal
                  embedded
                  session={session}
                  providers={providers}
                  initialProvider={providers.find((p) => p.isDefault)?.provider ?? null}
                  onSaved={onProviderSaved}
                  onClose={() => void onProviderSaved()}
                />
              </>
            )}

            {section === "pastas" && (
              <>
                <p className="muted">
                  Informe os caminhos locais. O agente só lê e grava dentro
                  dessas pastas.
                </p>
                <div className="workspace-list">
                  {workspaceItems.map((item) => (
                    <div key={`${item.label}-${item.path}`}>
                      <strong>{item.label}</strong>
                      <code>{item.path}</code>
                      <button
                        className="ghost"
                        onClick={() => void onRemoveWorkspace(item.path)}
                      >
                        Remover autorização
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="ghost"
                  onClick={() => void onSuggestWorkspaces()}
                >
                  Adicionar Downloads e Área de trabalho detectados
                </button>
                <label className="field">
                  <span className="field-label">
                    Nome (ex.: Downloads ou Desktop)
                  </span>
                  <input
                    value={workspaceLabel}
                    onChange={(e) => onWorkspaceLabelChange(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Caminho local</span>
                  <input
                    value={workspacePath}
                    onChange={(e) => onWorkspacePathChange(e.target.value)}
                    placeholder="/home/voce/Downloads"
                  />
                </label>
                <div className="settings-section-actions">
                  <button
                    className="primary"
                    onClick={() => void onSaveWorkspaces()}
                  >
                    Adicionar pasta
                  </button>
                </div>
              </>
            )}

            {section === "memoria" && (
              <>
                <p className="muted">
                  Preferências e contexto ajudam em novos chats. Sugestões
                  automáticas só são salvas depois da sua aprovação. Evite
                  senhas e dados sensíveis.
                </p>
                {memoryError && (
                  <p className="alert alert-notice error" role="alert">
                    <AlertCircle size={16} aria-hidden="true" />
                    <span>{memoryError}</span>
                  </p>
                )}
                <label className="field">
                  <span>
                    <input
                      type="checkbox"
                      checked={memorySettings.useMemoriesInChat}
                      onChange={(event) =>
                        void onUpdateMemorySetting({
                          useMemoriesInChat: event.target.checked,
                        })
                      }
                    />{" "}
                    Usar memórias nos chats
                  </span>
                </label>
                <label className="field">
                  <span>
                    <input
                      type="checkbox"
                      checked={memorySettings.automaticSuggestionsEnabled}
                      onChange={(event) =>
                        void onUpdateMemorySetting({
                          automaticSuggestionsEnabled: event.target.checked,
                        })
                      }
                    />{" "}
                    Sugerir novas memórias
                  </span>
                </label>
                {memorySuggestions.length > 0 && (
                  <h3>Sugestões para revisar</h3>
                )}
                <div className="workspace-list">
                  {memorySuggestions.map((item) => (
                    <div key={item.id}>
                      <strong>
                        {item.category} · {item.key}
                      </strong>
                      <p>{item.value}</p>
                      <button
                        className="ghost"
                        onClick={() => void onAcceptMemorySuggestion(item.id)}
                      >
                        Guardar
                      </button>
                      <button
                        className="ghost"
                        onClick={() => void onDismissMemorySuggestion(item.id)}
                      >
                        Agora não
                      </button>
                    </div>
                  ))}
                </div>
                <div className="workspace-list">
                  {memories.map((item) => (
                    <div key={item.key}>
                      <strong>
                        {item.category || "context"} · {item.key}
                      </strong>
                      <p>{item.value}</p>
                      <button
                        className="ghost"
                        onClick={() => onEditMemory(item)}
                      >
                        Editar
                      </button>
                      <button
                        className="ghost"
                        onClick={() => void onDeleteMemory(item.key)}
                      >
                        Apagar
                      </button>
                    </div>
                  ))}
                </div>
                {memories.length > 0 && (
                  <button
                    className="ghost"
                    onClick={() => void onClearAllMemories()}
                  >
                    Apagar todas as memórias
                  </button>
                )}
                <label className="field">
                  <span className="field-label">O que lembrar (ex.: idioma)</span>
                  <input
                    value={memoryKey}
                    onChange={(e) => onMemoryKeyChange(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Categoria</span>
                  <select
                    value={memoryCategory}
                    onChange={(e) => onMemoryCategoryChange(e.target.value)}
                  >
                    <option value="preference">Preferência</option>
                    <option value="writing_style">Estilo de escrita</option>
                    <option value="project">Projeto</option>
                    <option value="workflow">Fluxo de trabalho</option>
                    <option value="person">Pessoa</option>
                    <option value="goal">Objetivo</option>
                    <option value="context">Contexto</option>
                    <option value="history">Histórico relevante</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Detalhe</span>
                  <textarea
                    value={memoryValue}
                    onChange={(e) => onMemoryValueChange(e.target.value)}
                    maxLength={2000}
                  />
                </label>
                <div className="settings-section-actions">
                  <button className="primary" onClick={() => void onSaveMemory()}>
                    Salvar memória
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
