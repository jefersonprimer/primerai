"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  Conversation,
  Device,
  Message,
  MemoryUsage,
  Provider,
  User,
  createConversation,
  deleteConversation,
  fetchWithAuth,
  getMessages,
  getSession,
  listConversations,
  listDevices,
  listProviders,
  sendMessage,
  uploadChatImage,
} from "@/lib/api";

type PendingImage = { id: string; name: string; mimeType: string; data: string; preview: string };

export default function ChatPage() {
  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [memoryUsage, setMemoryUsage] = useState<MemoryUsage | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  // Initial load
  useEffect(() => {
    const session = getSession();
    if (!session) {
      window.location.replace("/entrar");
      return;
    }
    setUser(session.user);

    async function loadInitialData() {
      setLoading(true);
      try {
        const [convList, provList, devList] = await Promise.all([
          listConversations(),
          listProviders(),
          listDevices(),
        ]);
        setConversations(convList);
        setProviders(provList);
        setDevices(devList);

        if (convList.length > 0) {
          const first = convList[0];
          setActiveConversationId(first.id);
          const msgs = await getMessages(first.id);
          setMessages(msgs);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

  // Switch conversation
  async function selectConversation(id: string) {
    setActiveConversationId(id);
    setError(null);
    setMemoryUsage(null);
    try {
      const msgs = await getMessages(id);
      setMessages(msgs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar mensagens.");
    }
  }

  // Create new conversation
  async function startNewChat() {
    setError(null);
    setActiveConversationId(null);
    setMessages([]);
    setMemoryUsage(null);
  }

  // Delete conversation
  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      const updated = conversations.filter((c) => c.id !== id);
      setConversations(updated);
      if (activeConversationId === id) {
        if (updated.length > 0) {
          selectConversation(updated[0].id);
        } else {
          setActiveConversationId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir conversa.");
    }
  }

  // Send message
  async function handleSend(customContent?: string) {
    const typedContent = (customContent || input).trim();
    const content = typedContent || (images.length ? "Analise as imagens anexadas." : "");
    if (!content || sending) return;

    setError(null);
    setSending(true);
    setInput("");
    const imagesToSend = images;
    setImages([]);

    try {
      let convId = activeConversationId;

      // If no active conversation, create one first
      if (!convId) {
        const newConv = await createConversation();
        setConversations((prev) => [newConv, ...prev]);
        setActiveConversationId(newConv.id);
        convId = newConv.id;
      }

      // Optimistic user message
      const tempUserMsg: Message = {
        id: `temp-${Date.now()}`,
        conversationId: convId,
        role: "user",
        content,
        parts: imagesToSend.map((image) => ({ type: "image" as const, attachmentId: image.id, mimeType: image.mimeType, name: image.name })),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      // Call API
      const attachments = await Promise.all(imagesToSend.map((image) => uploadChatImage(convId!, image)));
      const response = await sendMessage(convId, content, attachments.map((attachment) => attachment.id));
      
      // Update message list with real responses
      setMessages((prev) => {
        const filtered = prev.filter((m) => !m.id.startsWith("temp-"));
        return [...filtered, ...response.messages];
      });
      setMemoryUsage(response.memoryUsage);

      // Update conversation title in sidebar if it changed
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, updatedAt: new Date().toISOString() } : c))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  }

  async function pickImages(files: FileList | null) {
    if (!files?.length) return;
    const selection = Array.from(files).slice(0, 4 - images.length);
    try {
      const loaded = await Promise.all(selection.map(async (file) => {
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error("Use imagens JPEG, PNG, WebP ou GIF.");
        if (file.size > 3 * 1024 * 1024) throw new Error("Cada imagem deve ter no máximo 3 MB.");
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(file);
        });
        const comma = dataUrl.indexOf(",");
        return { id: `${file.name}-${file.lastModified}-${Math.random()}`, name: file.name, mimeType: file.type, data: dataUrl.slice(comma + 1), preview: dataUrl };
      }));
      setImages((current) => [...current, ...loaded].slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível preparar as imagens.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function logout() {
    localStorage.removeItem("primerai.session");
    window.location.assign("/");
  }

  const activeDesktop = devices.find((d) => d.kind === "desktop" && d.status === "online");
  const defaultProvider = providers.find((p) => p.isDefault) || providers[0];

  return (
    <div className="chat-layout">
      {/* Sidebar */}
      <aside className={`chat-sidebar ${sidebarOpen ? "" : "collapsed"}`}>
        <div className="sidebar-header">
          <Link className="brand" href="/">
            primer<span>ai</span>
          </Link>
          <button
            className="toggle-sidebar-btn"
            onClick={() => setSidebarOpen(false)}
            title="Fechar menu"
          >
            ✕
          </button>
        </div>

        <button className="new-chat-btn" onClick={startNewChat}>
          <span>＋</span> Novo Chat
        </button>

        <Link className="new-chat-btn" href="/automacoes"><span>⚡</span> Automações</Link>
        <Link className="new-chat-btn" href="/missoes"><span>◎</span> Modo missão</Link>

        <div className="sidebar-history">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`history-item ${c.id === activeConversationId ? "active" : ""}`}
              onClick={() => selectConversation(c.id)}
            >
              <span className="history-item-title">{c.title || "Nova conversa"}</span>
              <button
                className="history-delete"
                onClick={(e) => handleDelete(c.id, e)}
                title="Excluir conversa"
              >
                ✕
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <div style={{ padding: "16px 12px", fontSize: 12, color: "#6e776d" }}>
              Nenhuma conversa recente.
            </div>
          )}
        </div>

        {/* Device Sync Status Badge */}
        <div className="sidebar-device-status">
          <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
            <span
              className={`status-indicator ${activeDesktop ? "online" : "offline"}`}
            />
            <b style={{ color: "#d6ddcf" }}>
              {activeDesktop ? activeDesktop.name : "Desktop Off-line"}
            </b>
          </div>
          <span style={{ color: "#7a8378" }}>
            {activeDesktop
              ? `${activeDesktop.platform} conectado`
              : "Baixe o app desktop para rodar tarefas no PC"}
          </span>
        </div>

        {/* Footer / Account */}
        <div className="sidebar-footer">
          <Link href="/conta" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: "#222c1f",
                color: "var(--green)",
                display: "grid",
                placeItems: "center",
                fontWeight: "bold",
                fontSize: 10,
              }}
            >
              {user?.name ? user.name[0].toUpperCase() : "U"}
            </span>
            <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
              {user?.name || user?.email || "Minha Conta"}
            </span>
          </Link>
          <button
            onClick={logout}
            style={{ background: "none", border: "none", color: "#8c948b", cursor: "pointer", fontSize: 11 }}
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="chat-main">
        {/* Top bar */}
        <header className="chat-topbar">
          <div className="topbar-left">
            {!sidebarOpen && (
              <button
                className="toggle-sidebar-btn"
                onClick={() => setSidebarOpen(true)}
                title="Abrir menu lateral"
              >
                ☰ Menu
              </button>
            )}
            <div className="provider-badge">
              <span style={{ color: "var(--green)" }}>✳</span>
              <span>{defaultProvider ? defaultProvider.name : "AI Provider"}</span>
              {defaultProvider?.defaultModel && (
                <span style={{ opacity: 0.6, fontSize: 11 }}>
                  ({defaultProvider.defaultModel})
                </span>
              )}
            </div>
          </div>
          <div>
            <Link
              href="/baixar"
              className="text-link"
              style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
            >
              <span>Baixar App Desktop</span> ↘
            </Link>
          </div>
        </header>

        {/* Messages / Zero state */}
        <section className="chat-messages">
          {memoryUsage && (memoryUsage.memories.length > 0 || memoryUsage.projects.length > 0) && (
            <div style={{ margin: "12px auto 0", maxWidth: 760, padding: "8px 12px", border: "1px solid #303833", borderRadius: 8, color: "#aeb8aa", fontSize: 12 }}>
              Usou do seu perfil: {[...memoryUsage.memories.map((memory) => `${memory.category}: ${memory.key}`), ...memoryUsage.projects.map((project) => `projeto: ${project.name}`)].join(" · ")}
            </div>
          )}
          {messages.length === 0 ? (
            <div className="chat-empty-state">
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 16,
                  background: "#182215",
                  color: "var(--green)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 24,
                  margin: "0 auto",
                }}
              >
                ✳
              </div>
              <h2>
                {user?.name ? `Olá, ${user.name.split(" ")[0]}!` : "O que vamos fazer hoje?"}
              </h2>
              <p>
                O PrimerAI está pronto para ajudar. Escreva uma instrução abaixo ou escolha um
                dos modelos de ação:
              </p>

              <div className="quick-prompts">
                <div
                  className="quick-prompt-card"
                  onClick={() =>
                    handleSend(
                      "Resuma os principais arquivos PDF encontrados na pasta Downloads do meu PC."
                    )
                  }
                >
                  <b>📄 Resumir PDFs no PC</b>
                  <span>Instrução direta enviada ao agente desktop</span>
                </div>
                <div
                  className="quick-prompt-card"
                  onClick={() =>
                    handleSend("Pesquise na web quais são as últimas novidades de Inteligência Artificial.")
                  }
                >
                  <b>🌐 Pesquisar na Web</b>
                  <span>Busca de informações atualizadas em tempo real</span>
                </div>
                <div
                  className="quick-prompt-card"
                  onClick={() =>
                    handleSend("Escreva um plano de ação semanal organizado por prioridades de trabalho.")
                  }
                >
                  <b>📅 Plano de Ação Semanal</b>
                  <span>Organização de tarefas e prioridades</span>
                </div>
                <div
                  className="quick-prompt-card"
                  onClick={() =>
                    handleSend("Ajude-me a refatorar uma função TypeScript para torná-la mais limpa e eficiente.")
                  }
                >
                  <b>💻 Assistente de Código</b>
                  <span>Refatoração, análise e revisão de scripts</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="messages-container">
              {messages.map((m) => (
                <div key={m.id} className="message-turn">
                  <div className={`message-header ${m.role}`}>
                    {m.role === "user" ? (
                      <span>Você</span>
                    ) : (
                      <>
                        <span style={{ color: "var(--green)" }}>✳</span>
                        <span>PrimerAI</span>
                      </>
                    )}
                  </div>
                  <div className={`message-body ${m.role}`}>{m.content}</div>
                  {m.parts.map((part) => part.type === "image" ? (
                    <div className="message-attachment" key={part.attachmentId}>🖼 {part.name}</div>
                  ) : null)}
                </div>
              ))}
              {sending && (
                <div className="message-turn">
                  <div className="message-header assistant">
                    <span style={{ color: "var(--green)" }}>✳</span>
                    <span>PrimerAI</span>
                  </div>
                  <div className="message-body assistant" style={{ color: "#8c958a" }}>
                    Digitando resposta...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {error && (
            <div
              className="form-error"
              style={{ marginTop: 16, width: "min(800px, 100%)", textAlign: "center" }}
            >
              {error}
            </div>
          )}
        </section>

        {/* Bottom Input Area */}
        <footer className="chat-input-wrapper">
          <div className="chat-input-box">
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(event) => void pickImages(event.target.files)} />
            {images.length > 0 && (
              <div className="chat-image-previews">
                {images.map((image) => <div className="chat-image-preview" key={image.id}>
                  <img src={image.preview} alt={image.name} />
                  <button type="button" onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))} aria-label={`Remover ${image.name}`}>×</button>
                </div>)}
              </div>
            )}
            <textarea
              className="chat-textarea"
              placeholder="Envie uma mensagem ou instrução para o PC..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <div className="chat-input-actions">
              <div className="chat-chips-row">
                <button className="chat-chip" type="button" onClick={() => fileInputRef.current?.click()} disabled={images.length >= 4}>
                  🖼 Anexar imagem
                </button>
                <button
                  className="chat-chip"
                  onClick={() => setInput((prev) => prev + " Pesquisar na web: ")}
                >
                  ⌕ Pesquisar Web
                </button>
                <button
                  className="chat-chip"
                  onClick={() => setInput((prev) => prev + " Executar no meu PC: ")}
                >
                  ▧ Tarefa no PC
                </button>
              </div>
              <button
                className="send-message-btn"
                onClick={() => handleSend()}
                disabled={(!input.trim() && !images.length) || sending}
                title="Enviar mensagem (Enter)"
              >
                ↑
              </button>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
