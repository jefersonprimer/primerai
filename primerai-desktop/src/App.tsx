import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import type { ChatMessage, Conversation } from "@primerai/shared";
import { Ellipsis, Trash2 } from "lucide-react";
import { ApiError, api, getStoredSession, storeSession, type Session } from "./lib/api";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { AuthScreen } from "./components/AuthScreen";
import "./App.css";

type Gate = "checking" | "anonymous" | "connection-error" | "needs-key" | "ready";

function errorMessage(err: unknown): string {
  return err instanceof ApiError
    ? `${err.message} (${api.baseUrl})`
    : "não foi possível conectar no servidor";
}

function App() {
  const [gate, setGate] = useState<Gate>("checking");
  const [session, setSession] = useState<Session | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [workspaceItems, setWorkspaceItems] = useState<{ label: string; path: string; enabled: boolean }[]>([]);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [memories, setMemories] = useState<{ key: string; value: string; createdAt: string }[]>([]);
  const [memoryKey, setMemoryKey] = useState("");
  const [memoryValue, setMemoryValue] = useState("");
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [workspaceLabel, setWorkspaceLabel] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [taskNotice, setTaskNotice] = useState("");
  const taskRunning = useRef(false);

  useEffect(() => {
    if (!session) { setDeviceId(null); return; }
    let cancelled = false;
    void api.registerDevice(session.accessToken).then(async (device) => {
      if (cancelled) return;
      setDeviceId(device.id);
      const roots = await api.listWorkspaces(session.accessToken, device.id);
      if (!cancelled) setWorkspaceItems(roots);
    }).catch((err) => setTaskNotice(err instanceof Error ? err.message : "falha ao registrar este desktop"));
    return () => { cancelled = true; };
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session || !deviceId) return;
    let cancelled = false;
    const runNext = async () => {
      if (taskRunning.current || cancelled) return;
      taskRunning.current = true;
      let claimedTaskId: string | null = null;
      try {
        await api.registerDevice(session.accessToken); // heartbeat, também marca o PC online
        const task = await api.claimTask(session.accessToken, deviceId);
        if (!task) return;
        claimedTaskId = task.id;
        setTaskNotice(`Executando: ${task.prompt}`);
        const pdfWork = /\b(pdf|documentos? anexados?)\b/i.test(task.prompt)
          && /\b(resum|analisa|analise|extrai|compare|comparar)\w*\b/i.test(task.prompt)
          && !/\b(pesquis|na internet|na web|ranking|top\s*\d+|maiores|melhores)\b/i.test(task.prompt);
        if (!pdfWork) {
          await api.updateTask(session.accessToken, task.id, 15, "Pesquisando na web e reunindo fontes");
          const research = await api.research(session.accessToken, task.prompt);
          const roots = await api.listWorkspaces(session.accessToken, deviceId);
          const desktop = roots.find((r) => r.enabled && /(desktop|área de trabalho)/i.test(r.label));
          if (!desktop) throw new Error("Configure a pasta Área de trabalho em Pastas autorizadas.");
          const allowed = roots.filter((r) => r.enabled).map((r) => r.path);
          const targetDir = `${desktop.path.replace(/[\\/]$/, "")}/Trabalho`;
          await invoke("create_directory", { path: targetDir, roots: allowed });
          await api.updateTask(session.accessToken, task.id, 90, "Salvando o resultado em arquivo de texto");
          const savedPath = await invoke<string>("write_text_file", { path: `${targetDir}/Pesquisa.txt`, text: research.output, roots: allowed });
          await api.finishTask(session.accessToken, task.id, { output: `Pesquisa concluída com ${research.sources.length} fontes. Arquivo salvo em ${savedPath}` });
          setTaskNotice(`Concluído: pesquisa salva em ${savedPath}`);
          return;
        }
        await api.updateTask(session.accessToken, task.id, 5, "Preparando leitura dos PDFs");
        const roots = await api.listWorkspaces(session.accessToken, deviceId);
        const downloads = roots.find((r) => r.enabled && /download/i.test(r.label));
        const desktop = roots.find((r) => r.enabled && /(desktop|área de trabalho)/i.test(r.label));
        if (!downloads || !desktop) throw new Error("Configure as pastas Downloads e Área de trabalho em Pastas autorizadas.");
        const allowed = roots.filter((r) => r.enabled).map((r) => r.path);
        const files = await invoke<string[]>("list_pdf_files", { directory: downloads.path, roots: allowed });
        if (!files.length) throw new Error("Não encontrei PDFs diretamente na pasta Downloads autorizada.");
        if (files.length > 20) throw new Error(`Encontrei ${files.length} PDFs; o limite por tarefa é 20. Separe os arquivos em grupos menores.`);
        const documents: { name: string; text: string }[] = [];
        for (let index = 0; index < files.length; index++) {
          const path = files[index]!;
          await api.updateTask(session.accessToken, task.id, 10 + Math.floor(index / files.length * 45), `Lendo PDF ${index + 1} de ${files.length}`);
          const text = await invoke<string>("extract_pdf_text", { path, roots: allowed });
          documents.push({ name: path.split(/[\\/]/).pop() ?? path, text });
        }
        if (documents.reduce((size, doc) => size + doc.text.length, 0) > 300_000) throw new Error("O texto extraído excede o limite de 300 mil caracteres. Divida os PDFs em grupos menores.");
        await api.updateTask(session.accessToken, task.id, 65, "Gerando resumo com a IA configurada");
        const summary = await api.summarize(session.accessToken, task.prompt, documents);
        const targetDir = `${desktop.path.replace(/[\\/]$/, "")}/Trabalho`;
        await api.updateTask(session.accessToken, task.id, 82, "Criando Trabalho e copiando os PDFs");
        await invoke("create_directory", { path: targetDir, roots: allowed });
        for (let index = 0; index < files.length; index++) {
          await api.updateTask(session.accessToken, task.id, 82 + Math.floor(index / files.length * 7), `Copiando PDF ${index + 1} de ${files.length}`);
          await invoke("copy_pdf", { source: files[index], directory: targetDir, roots: allowed });
        }
        await api.updateTask(session.accessToken, task.id, 91, "Gravando o relatório PDF");
        const reportPath = await invoke<string>("write_report_pdf", { path: `${targetDir}/Relatorio.pdf`, title: "Relatório dos PDFs", text: summary, roots: allowed });
        await api.finishTask(session.accessToken, task.id, { output: `Copiei ${files.length} PDF(s) para ${targetDir}. Relatório salvo em ${reportPath}` });
        setTaskNotice(`Concluído: PDFs e relatório salvos em ${targetDir}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "falha ao executar tarefa";
        setTaskNotice(message);
        if (claimedTaskId) await api.finishTask(session.accessToken, claimedTaskId, { error: message }).catch(() => {});
      } finally { taskRunning.current = false; }
    };
    const timer = setInterval(() => void runNext(), 2500);
    void runNext();
    return () => { cancelled = true; clearInterval(timer); };
  }, [session?.accessToken, deviceId]);

  async function saveWorkspaces() {
    if (!session || !deviceId) return;
    const next = [...workspaceItems, { label: workspaceLabel.trim(), path: workspacePath.trim(), enabled: true }]
      .filter((r) => r.label && r.path);
    await api.saveWorkspaces(session.accessToken, deviceId, next);
    setWorkspaceItems(next);
    setWorkspaceLabel(""); setWorkspacePath("");
  }

  async function suggestWorkspaces() {
    if (!session || !deviceId) return;
    const found = await invoke<{ label: string; path: string }[]>("suggested_workspaces");
    const next = [...workspaceItems, ...found.map((item) => ({ ...item, enabled: true }))]
      .filter((item, index, all) => all.findIndex((other) => other.path === item.path) === index);
    await api.saveWorkspaces(session.accessToken, deviceId, next);
    setWorkspaceItems(next);
  }

  async function removeWorkspace(path: string) {
    if (!session || !deviceId) return;
    const next = workspaceItems.filter((item) => item.path !== path);
    await api.saveWorkspaces(session.accessToken, deviceId, next);
    setWorkspaceItems(next);
  }

  async function loadMemories() {
    if (!session) return;
    setMemoryError(null);
    try { setMemories(await api.listMemories(session.accessToken)); }
    catch (err) { setMemoryError(err instanceof Error ? err.message : "Não foi possível carregar a memória."); }
  }

  async function saveMemory() {
    if (!session || !memoryKey.trim() || !memoryValue.trim()) return;
    setMemoryError(null);
    try {
      await api.saveMemory(session.accessToken, memoryKey, memoryValue);
      setMemoryKey(""); setMemoryValue(""); await loadMemories();
    } catch (err) { setMemoryError(err instanceof Error ? err.message : "Não foi possível salvar a memória."); }
  }

  async function deleteMemory(key: string) {
    if (!session) return;
    try { await api.deleteMemory(session.accessToken, key); await loadMemories(); }
    catch (err) { setMemoryError(err instanceof Error ? err.message : "Não foi possível apagar a memória."); }
  }

  const loadProviders = useCallback(async (active: Session) => {
    return api.listProviders(active.accessToken);
  }, []);

  const loadConversations = useCallback(async (active: Session) => {
    const list = await api.listConversations(active.accessToken);
    setConversations(list);
    return list;
  }, []);

  const enterWithSession = useCallback(async (active: Session) => {
    setBootError(null);
    const result = await api.me(active.accessToken);
    const validSession = { ...active, user: result.user };
    storeSession(validSession);
    setSession(validSession);

    try {
      const list = await loadProviders(validSession);
      const chats = await loadConversations(validSession);
      setActiveConversation((current) => current && chats.some((chat) => chat.id === current)
        ? current
        : chats[0]?.id ?? null);
      setGate(list.length === 0 ? "needs-key" : "ready");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
      // A provider-list failure should not log out a user whose session is valid.
      setBootError(errorMessage(err));
      setGate("ready");
    }
  }, [loadProviders, loadConversations]);

  const checkStoredSession = useCallback(async () => {
    setGate("checking");
    setBootError(null);
    const stored = getStoredSession();
    if (!stored) {
      setSession(null);
      setGate("anonymous");
      return;
    }

    try {
      await enterWithSession(stored);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        storeSession(null);
        setSession(null);
        setGate("anonymous");
        return;
      }
      setBootError(errorMessage(err));
      setGate("connection-error");
    }
  }, [enterWithSession]);

  useEffect(() => {
    void checkStoredSession();
  }, [checkStoredSession]);

  const onAuthenticated = useCallback(async (active: Session) => {
    try {
      await enterWithSession(active);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        storeSession(null);
        setSession(null);
        setGate("anonymous");
      }
      throw err;
    }
  }, [enterWithSession]);

  const onGoogleSignIn = useCallback(async () => {
    const webUrl = (import.meta.env.VITE_WEB_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    const returnUri = isTauri() ? "primerai://auth/callback" : `${window.location.origin}/`;
    const loginUrl = `${webUrl}/api/auth/google/start?return_uri=${encodeURIComponent(returnUri)}`;
    if (isTauri()) await openUrl(loginUrl);
    else window.location.assign(loginUrl);
  }, []);

  useEffect(() => {
    const handleCode = async (code: string) => {
      try {
        const incoming = await api.exchangeNativeCode(code);
        storeSession(incoming);
        await onAuthenticated(incoming);
      } catch (err) {
        setBootError(err instanceof Error ? err.message : "não foi possível finalizar o login Google");
        setGate("anonymous");
      }
    };
    if (!isTauri()) {
      const code = new URLSearchParams(window.location.hash.slice(1)).get("code");
      if (code) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        void handleCode(code);
      }
      return;
    }
    let unlisten: (() => void) | undefined;
    let disposed = false;
    const handleUrls = async (urls: string[]) => {
      for (const value of urls) {
        try {
          const url = new URL(value);
          if (url.protocol !== "primerai:") continue;
          const code = new URLSearchParams(url.hash.slice(1)).get("code");
          if (!code) continue;
          await handleCode(code);
        } catch (err) {
          setBootError(err instanceof Error ? err.message : "não foi possível finalizar o login Google");
          setGate("anonymous");
        }
      }
    };
    void Promise.all([
      getCurrent().then((urls) => { if (urls && !disposed) return handleUrls(urls); }),
      onOpenUrl((urls) => { void handleUrls(urls); }).then((off) => { if (disposed) off(); else unlisten = off; }),
    ]).catch((err) => setBootError(err instanceof Error ? err.message : "não foi possível preparar o callback Google"));
    return () => { disposed = true; unlisten?.(); };
  }, [onAuthenticated]);

  const onProviderSaved = useCallback(async () => {
    if (!session) return;
    try {
      const list = await loadProviders(session);
      setGate(list.length === 0 ? "needs-key" : "ready");
      setBootError(null);
    } catch (err) {
      setBootError(errorMessage(err));
    }
  }, [session, loadProviders]);

  useEffect(() => {
    if (!session || !activeConversation) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    void api.listMessages(session.accessToken, activeConversation).then((list) => {
      if (!cancelled) setMessages(list);
    }).catch((err) => {
      if (!cancelled) setChatError(errorMessage(err));
    });
    return () => { cancelled = true; };
  }, [session, activeConversation]);

  async function startConversation() {
    if (!session) return;
    setChatError(null);
    try {
      const created = await api.createConversation(session.accessToken);
      setActiveConversation(created.id);
      setMessages([]);
      setConversations((current) => [created, ...current]);
    } catch (err) {
      setChatError(errorMessage(err));
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !activeConversation || !draft.trim() || sending) return;
    const content = draft.trim();
    setDraft("");
    setSending(true);
    setChatError(null);
    try {
      const saved = await api.sendMessage(session.accessToken, activeConversation, content);
      setMessages((current) => [...current, ...saved]);
      setConversations(await api.listConversations(session.accessToken));
    } catch (err) {
      setDraft(content);
      setChatError(err instanceof ApiError ? err.message : "não foi possível enviar a mensagem");
    } finally {
      setSending(false);
    }
  }

  async function selectConversation(id: string) {
    setActiveConversation(id);
    setMessages([]);
    setChatError(null);
  }

  async function deleteConversation() {
    if (!session || !deleteTarget || deleting) return;
    setDeleting(true);
    setChatError(null);
    try {
      await api.deleteConversation(session.accessToken, deleteTarget.id);
      const remaining = conversations.filter((item) => item.id !== deleteTarget.id);
      setConversations(remaining);
      if (activeConversation === deleteTarget.id) {
        setActiveConversation(remaining[0]?.id ?? null);
        setMessages([]);
      }
      setDeleteTarget(null);
    } catch (err) {
      setChatError(err instanceof ApiError ? err.message : "não foi possível apagar a conversa");
    } finally {
      setDeleting(false);
    }
  }

  async function logout() {
    if (session) await api.logout(session.accessToken).catch(() => storeSession(null));
    else storeSession(null);
    setSession(null);
    setConversations([]);
    setActiveConversation(null);
    setMessages([]);
    setShowSettings(false);
    setBootError(null);
    setGate("anonymous");
  }

  if (gate === "checking") {
    return (
      <main className="boot">
        <div className="spinner" aria-hidden />
        <p>verificando sessão…</p>
      </main>
    );
  }

  if (gate === "anonymous") return <AuthScreen onAuthenticated={onAuthenticated} onGoogleSignIn={onGoogleSignIn} />;

  if (gate === "connection-error") {
    return (
      <main className="boot">
        <h1>Não foi possível verificar a sessão</h1>
        <p className="alert error">{bootError}</p>
        <button className="primary" onClick={() => void checkStoredSession()}>Tentar de novo</button>
        <button className="ghost" onClick={logout}>Ir para o login</button>
      </main>
    );
  }

  const showModal = gate === "needs-key" || showSettings;

  return (
    <main className="chat-shell">
      <aside className="chat-sidebar">
        <div className="sidebar-brand"><strong>PrimerAI</strong></div>
        <button className="primary new-chat" onClick={() => void startConversation()}>+ Novo chat</button>
        <p className="sidebar-label">Histórico</p>
        <nav className="conversation-list" aria-label="Histórico de conversas">
          {conversations.map((conversation) => (
            <div key={conversation.id} className={`conversation-row${activeConversation === conversation.id ? " active" : ""}`}>
              <button
                className="conversation-item"
                onClick={() => void selectConversation(conversation.id)}
              >
                <span>{conversation.title}</span>
                <small>{conversation.model}</small>
              </button>
              <button
                className="conversation-menu-button"
                aria-label={`Opções de ${conversation.title}`}
                title="Opções da conversa"
                onClick={() => setDeleteTarget(conversation)}
              >
                <Ellipsis size={18} aria-hidden="true" />
              </button>
            </div>
          ))}
          {conversations.length === 0 && <span className="muted sidebar-empty">Seus chats aparecerão aqui.</span>}
        </nav>
        <div className="sidebar-footer">
          <span title={session?.user.email}>{session?.user.email}</span>
          <button className="ghost" onClick={() => setShowSettings(true)}>Providers</button>
          <button className="ghost" onClick={() => setShowWorkspaces(true)}>Pastas autorizadas</button>
          <button className="ghost" onClick={() => { setShowMemories(true); void loadMemories(); }}>Memória da IA</button>
          <button className="ghost" onClick={() => void logout()}>Sair</button>
        </div>
      </aside>

      <section className="chat-main">
        <header className="chat-topbar">
          <strong>{activeConversation ? conversations.find((c) => c.id === activeConversation)?.title ?? "Chat" : "Novo chat"}</strong>
          <span className="muted">{activeConversation ? conversations.find((c) => c.id === activeConversation)?.model : ""}</span>
        </header>
        {taskNotice && <p className="alert chat-alert">{taskNotice}</p>}
        {bootError && <p className="alert error chat-alert">{bootError}</p>}
        <div className="chat-messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="chat-welcome">
              <h1>O que vamos fazer?</h1>
              <p className="muted">Converse com seu modelo de IA. Suas conversas ficam salvas no histórico.</p>
              {!activeConversation && <button className="primary" onClick={() => void startConversation()}>Começar um chat</button>}
            </div>
          )}
          {messages.map((message) => (
            <article key={message.id} className={`chat-message ${message.role}`}>
              <strong>{message.role === "user" ? "Você" : "IA"}</strong>
              <p>{message.content}</p>
            </article>
          ))}
          {sending && <p className="muted assistant-thinking">A IA está respondendo…</p>}
        </div>
        {chatError && <p className="alert error chat-alert">{chatError}</p>}
        <form className="chat-composer" onSubmit={sendMessage}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={activeConversation ? "Escreva sua mensagem…" : "Crie um chat para começar"}
            disabled={!activeConversation || sending}
            rows={3}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button className="primary" type="submit" disabled={!activeConversation || !draft.trim() || sending}>
            {sending ? "…" : "Enviar"}
          </button>
        </form>
      </section>

      {showModal && session && (
        <ApiKeyModal
          session={session}
          onClose={() => {
            setShowSettings(false);
            void onProviderSaved();
          }}
        />
      )}

      {showWorkspaces && (
        <div className="modal-backdrop" role="presentation">
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="workspaces-title">
            <h2 id="workspaces-title">Pastas autorizadas neste PC</h2>
            <p className="muted">Informe os caminhos locais. O agente só lê e grava dentro dessas pastas.</p>
            <div className="workspace-list">{workspaceItems.map((item) => <div key={`${item.label}-${item.path}`}><strong>{item.label}</strong><code>{item.path}</code><button className="ghost" onClick={() => void removeWorkspace(item.path)}>Remover autorização</button></div>)}</div>
            <button className="ghost" onClick={() => void suggestWorkspaces()}>Adicionar Downloads e Área de trabalho detectados</button>
            <label className="field"><span className="field-label">Nome (ex.: Downloads ou Desktop)</span><input value={workspaceLabel} onChange={(e) => setWorkspaceLabel(e.target.value)} /></label>
            <label className="field"><span className="field-label">Caminho local</span><input value={workspacePath} onChange={(e) => setWorkspacePath(e.target.value)} placeholder="/home/voce/Downloads" /></label>
            <footer><button className="ghost" onClick={() => setShowWorkspaces(false)}>Fechar</button><button className="primary" onClick={() => void saveWorkspaces()}>Adicionar pasta</button></footer>
          </section>
        </div>
      )}

      {showMemories && (
        <div className="modal-backdrop" role="presentation">
          <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="memories-title">
            <h2 id="memories-title">Memória da IA</h2>
            <p className="muted">A IA usa estas informações em todos os seus chats. Evite salvar senhas ou dados sensíveis.</p>
            {memoryError && <p className="alert error">{memoryError}</p>}
            <div className="workspace-list">{memories.map((item) => <div key={item.key}><strong>{item.key}</strong><p>{item.value}</p><button className="ghost" onClick={() => void deleteMemory(item.key)}>Apagar</button></div>)}</div>
            <label className="field"><span className="field-label">O que lembrar (ex.: idioma)</span><input value={memoryKey} onChange={(e) => setMemoryKey(e.target.value)} /></label>
            <label className="field"><span className="field-label">Detalhe</span><textarea value={memoryValue} onChange={(e) => setMemoryValue(e.target.value)} maxLength={2000} /></label>
            <footer><button className="ghost" onClick={() => setShowMemories(false)}>Fechar</button><button className="primary" onClick={() => void saveMemory()}>Salvar memória</button></footer>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !deleting) setDeleteTarget(null);
        }}>
          <section className="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
            <h2 id="delete-title">Apagar conversa?</h2>
            <p>“{deleteTarget.title}” e todas as mensagens serão apagadas permanentemente.</p>
            <footer>
              <button className="ghost" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button className="danger" disabled={deleting} onClick={() => void deleteConversation()}>
                {!deleting && <Trash2 size={16} aria-hidden="true" />}
                {deleting ? "Apagando…" : "Apagar"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
