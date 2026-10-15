"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createProject, deleteMemory, deleteProject, fetchWithAuth, getMemorySettings, listMemories, listProjects, saveMemory, updateMemorySettings, updateProject, type Memory, type MemorySettings, type ProjectProfile } from "@/lib/api";

type User = { email: string; name: string | null };
export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [notion, setNotion] = useState<{ connected: boolean; workspaceName: string | null } | null>(null);
  const [notionBusy, setNotionBusy] = useState(false);
  const [calendar, setCalendar] = useState<{ connected: boolean; calendarId: string | null } | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [projects, setProjects] = useState<ProjectProfile[]>([]);
  const [memorySettings, setMemorySettings] = useState<MemorySettings>({ useMemoriesInChat: true, automaticSuggestionsEnabled: false });
  const [memoryKey, setMemoryKey] = useState("");
  const [memoryValue, setMemoryValue] = useState("");
  const [memoryValidUntil, setMemoryValidUntil] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectObjective, setProjectObjective] = useState("");
  const [projectStack, setProjectStack] = useState("");
  const [projectDecisions, setProjectDecisions] = useState("");
  async function refreshMemoryProfile() {
    const [items, profiles, settings] = await Promise.all([listMemories(), listProjects(), getMemorySettings()]);
    setMemories(items); setProjects(profiles); setMemorySettings(settings);
  }
  useEffect(() => {
    const raw = localStorage.getItem("primerai.session");
    if (!raw) { window.location.replace("/entrar"); return; }
    try { const session = JSON.parse(raw) as { user?: User }; if (!session.user) throw new Error(); setUser(session.user); }
    catch { localStorage.removeItem("primerai.session"); window.location.replace("/entrar"); }
    void fetchWithAuth("/v1/integrations/notion").then(async (res) => { if (res.ok) setNotion(await res.json()); }).catch(() => undefined);
    void fetchWithAuth("/v1/integrations/calendar").then(async (res) => { if (res.ok) setCalendar(await res.json()); }).catch(() => undefined);
    void refreshMemoryProfile().catch((error) => setNotice(error instanceof Error ? error.message : "Não foi possível carregar a memória."));
    const status = new URLSearchParams(window.location.search).get("notion");
    if (status === "connected") setNotice("Notion conectado. Agora você pode pedir para a IA criar notas por lá.");
    if (status === "error") setNotice("Não foi possível conectar ao Notion. Tente novamente.");
    const calendarStatus = new URLSearchParams(window.location.search).get("calendar");
    if (calendarStatus === "connected") { setNotice("Google Calendar conectado. Agora você pode pedir para a IA criar eventos."); void fetchWithAuth("/v1/integrations/calendar").then(async (res) => { if (res.ok) setCalendar(await res.json()); }); }
    if (calendarStatus === "error") setNotice("Não foi possível conectar ao Google Calendar. Tente novamente.");
  }, []);
  async function connectNotion() {
    setNotionBusy(true); setNotice("");
    try {
      const res = await fetchWithAuth("/v1/integrations/notion/connect");
      const data = await res.json();
      if (!res.ok || !data.authorizationUrl) throw new Error(data.error?.message || "Não foi possível iniciar a conexão.");
      window.location.assign(data.authorizationUrl);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível iniciar a conexão."); setNotionBusy(false); }
  }
  async function disconnectNotion() {
    setNotionBusy(true);
    try {
      const res = await fetchWithAuth("/v1/integrations/notion", { method: "DELETE" });
      if (!res.ok) throw new Error("Não foi possível desconectar o Notion.");
      setNotion({ connected: false, workspaceName: null }); setNotice("Notion desconectado.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Falha ao desconectar."); }
    finally { setNotionBusy(false); }
  }
  async function connectCalendar() {
    setCalendarBusy(true); setNotice("");
    try {
      const res = await fetchWithAuth("/v1/integrations/calendar/connect");
      const data = await res.json();
      if (!res.ok || !data.authorizationUrl) throw new Error(data.error?.message || "Não foi possível iniciar a conexão.");
      window.location.assign(data.authorizationUrl);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível iniciar a conexão."); setCalendarBusy(false); }
  }
  async function disconnectCalendar() {
    setCalendarBusy(true);
    try {
      const res = await fetchWithAuth("/v1/integrations/calendar", { method: "DELETE" });
      if (!res.ok) throw new Error("Não foi possível desconectar o Google Calendar.");
      setCalendar({ connected: false, calendarId: null }); setNotice("Google Calendar desconectado.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Falha ao desconectar."); }
    finally { setCalendarBusy(false); }
  }
  function logout() { localStorage.removeItem("primerai.session"); window.location.assign("/"); }
  async function addMemory() { try { await saveMemory(memoryKey.trim(), memoryValue.trim(), "context", null, memoryValidUntil ? new Date(`${memoryValidUntil}T23:59:59.999Z`).toISOString() : null); setMemoryKey(""); setMemoryValue(""); setMemoryValidUntil(""); await refreshMemoryProfile(); } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível salvar a memória."); } }
  async function addProject() { try { await createProject({ name: projectName.trim(), objective: projectObjective.trim() || null, stack: projectStack.split(",").map((item) => item.trim()).filter(Boolean), decisions: projectDecisions.split("\n").map((item) => item.trim()).filter(Boolean) }); setProjectName(""); setProjectObjective(""); setProjectStack(""); setProjectDecisions(""); await refreshMemoryProfile(); } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível criar o projeto."); } }
  const panel = { marginTop: 24, padding: 24, border: "1px solid #303833", borderRadius: 12, width: "min(620px, 100%)", textAlign: "left" as const, background: "rgba(15,19,15,.7)" };
  const input = { width: "100%", margin: "6px 0", padding: 10, borderRadius: 8, border: "1px solid #303833", color: "#edf2e9", background: "#151a15" };
  return <main className="account-page"><nav className="nav wrap"><Link className="brand" href="/">primer<span>ai</span></Link><button className="nav-login" onClick={logout}>Sair</button></nav><section className="account-card"><div className="account-mark">✳</div><span className="eyebrow">CONTA PRIMERAI</span><h1>{user?.name ? `Olá, ${user.name}.` : "Sua conta está pronta."}</h1><p>Você entrou como <b>{user?.email ?? ""}</b>. Use a mesma conta nos aplicativos PrimerAI.</p><div style={panel}><span className="eyebrow">INTEGRAÇÕES</span><h2 style={{ fontSize: 20, margin: "14px 0 6px" }}>Google Calendar</h2><p style={{ margin: "0 0 16px", fontSize: 13 }}>{calendar?.connected ? "Conectado. Peça à IA para agendar reuniões, consultas e compromissos." : "Conecte sua agenda para permitir que a IA crie eventos quando você pedir."}</p><button className="button button-primary" disabled={calendarBusy} onClick={calendar?.connected ? disconnectCalendar : connectCalendar}>{calendarBusy ? "Aguarde…" : calendar?.connected ? "Desconectar Google Calendar" : "Conectar Google Calendar"}</button><h2 style={{ fontSize: 20, margin: "24px 0 6px" }}>Notion</h2><p style={{ margin: "0 0 16px", fontSize: 13 }}>{notion?.connected ? `Conectado${notion.workspaceName ? ` a ${notion.workspaceName}` : ""}. Compartilhe uma página do Notion com o PrimerAI para permitir a criação de notas.` : "Conecte seu espaço de trabalho para permitir que a IA crie notas por você."}</p><button className="button button-primary" disabled={notionBusy} onClick={notion?.connected ? disconnectNotion : connectNotion}>{notionBusy ? "Aguarde…" : notion?.connected ? "Desconectar Notion" : "Conectar Notion"}</button></div><div style={panel}><span className="eyebrow">MEMÓRIA E PERFIL</span><p style={{ fontSize: 13 }}>Você controla o que é usado nos chats. Sugestões automáticas nunca entram sem aprovação.</p><label><input type="checkbox" checked={memorySettings.useMemoriesInChat} onChange={async (e) => { const settings = await updateMemorySettings({ useMemoriesInChat: e.target.checked }); setMemorySettings(settings); }} /> Usar memórias nos chats</label><label style={{ display: "block", marginTop: 8 }}><input type="checkbox" checked={memorySettings.automaticSuggestionsEnabled} onChange={async (e) => { const settings = await updateMemorySettings({ automaticSuggestionsEnabled: e.target.checked }); setMemorySettings(settings); }} /> Sugerir novas memórias</label><h2 style={{ fontSize: 18 }}>Adicionar memória</h2><input style={input} value={memoryKey} onChange={(e) => setMemoryKey(e.target.value)} placeholder="Chave (ex.: resposta-curta)" maxLength={120} /><textarea style={input} value={memoryValue} onChange={(e) => setMemoryValue(e.target.value)} placeholder="O que lembrar" maxLength={2000} /><label style={{ display: "block", fontSize: 12 }}>Expira em (opcional)<input type="date" style={input} value={memoryValidUntil} onChange={(e) => setMemoryValidUntil(e.target.value)} /></label><button className="button button-secondary" disabled={!memoryKey.trim() || !memoryValue.trim()} onClick={addMemory}>Salvar memória</button>{memories.map((memory) => <div key={memory.key} style={{ borderTop: "1px solid #303833", marginTop: 12, paddingTop: 10 }}><b>{memory.category} · {memory.key}</b><p style={{ fontSize: 13, margin: "5px 0" }}>{memory.value}</p>{memory.validUntil && <small>Válida até {new Date(memory.validUntil).toLocaleDateString("pt-BR")}</small>}<button className="text-link" style={{ marginLeft: 12 }} onClick={async () => { await deleteMemory(memory.key); await refreshMemoryProfile(); }}>Apagar</button></div>)}</div><div style={panel}><span className="eyebrow">PROJETOS</span><p style={{ fontSize: 13 }}>Fichas ativas ajudam a retomar o trabalho sem reenviar todo o histórico.</p><input style={input} value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Nome do projeto" maxLength={120} /><textarea style={input} value={projectObjective} onChange={(e) => setProjectObjective(e.target.value)} placeholder="Objetivo do projeto (opcional)" maxLength={2000} /><input style={input} value={projectStack} onChange={(e) => setProjectStack(e.target.value)} placeholder="Stack, separada por vírgulas" /><textarea style={input} value={projectDecisions} onChange={(e) => setProjectDecisions(e.target.value)} placeholder="Uma decisão por linha" /><button className="button button-secondary" disabled={!projectName.trim()} onClick={addProject}>Criar projeto</button>{projects.map((project) => <div key={project.id} style={{ borderTop: "1px solid #303833", marginTop: 12, paddingTop: 10 }}><b>{project.name} · {project.status}</b><p style={{ fontSize: 13, margin: "5px 0" }}>{project.objective || "Sem objetivo informado."}</p>{project.stack.length > 0 && <small>Stack: {project.stack.join(", ")}</small>}{project.decisions.length > 0 && <small style={{ display: "block" }}>Decisões: {project.decisions.join(" · ")}</small>}<small style={{ display: "block" }}>Confirmado em {new Date(project.lastConfirmedAt).toLocaleDateString("pt-BR")}</small><button className="text-link" style={{ marginTop: 4 }} onClick={async () => { await updateProject(project.id, { confirm: true }); await refreshMemoryProfile(); }}>Confirmar atual</button><button className="text-link" style={{ marginLeft: 12 }} onClick={async () => { await deleteProject(project.id); await refreshMemoryProfile(); }}>Apagar</button></div>)}</div>{notice && <p role="status" style={{ color: "#c8e99a", fontSize: 13 }}>{notice}</p>}<div className="hero-actions"><Link className="button button-primary" href="/baixar">Baixar os apps <span>↓</span></Link><Link className="button button-secondary" href="/">Voltar ao início</Link></div></section></main>;
}
