"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Device, fetchWithAuth, getSession, listDevices } from "@/lib/api";

type Automation = { id: string; name: string; prompt: string; frequency: "daily" | "weekly"; time: string; weekday: number | null; timezone: string; enabled: boolean; nextRunAt: string; lastRunAt: string | null };
const days = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export default function AutomationsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [items, setItems] = useState<Automation[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [weekday, setWeekday] = useState(1);
  const [time, setTime] = useState("08:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetchWithAuth("/v1/automations");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Não foi possível carregar suas automações.");
    setItems(data.automations);
  }, []);
  useEffect(() => {
    if (!getSession()) { window.location.replace("/entrar"); return; }
    Promise.all([listDevices(), load()]).then(([found]) => { setDevices(found); setDeviceId(found.find((d) => d.kind === "desktop")?.id ?? ""); }).catch((e) => setError(e.message));
  }, [load]);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetchWithAuth("/v1/automations", { method: "POST", body: JSON.stringify({ name, prompt, deviceId, frequency, time, weekday: frequency === "weekly" ? weekday : null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Não foi possível criar a rotina.");
      setName(""); setPrompt(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Erro inesperado."); } finally { setBusy(false); }
  }
  async function action(id: string, method: string, body?: unknown) {
    const response = await fetchWithAuth(`/v1/automations/${id}${method === "RUN" ? "/run" : ""}`, { method: method === "RUN" ? "POST" : method, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "Ação não concluída.");
    await load();
  }
  return <main className="account-page"><nav className="nav wrap"><Link href="/" className="brand"><span>✳</span> PrimerAI</Link><div><Link href="/chat">Voltar ao chat</Link></div></nav><section className="wrap automation-page">
    <p className="eyebrow">AUTOMAÇÃO PESSOAL</p><h1>Deixe sua IA cuidar da rotina.</h1><p className="automation-intro">Crie uma tarefa recorrente. O PrimerAI a entrega ao desktop escolhido no horário configurado.</p>
    <form className="auth-form automation-form" onSubmit={create}><h2>Nova rotina</h2>
      <label>Nome<input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Resumo diário de tecnologia" /></label>
      <label>O que a IA deve fazer?<textarea required maxLength={8000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Pesquise as notícias importantes de tecnologia e resuma os principais fatos." /></label>
      <div className="automation-fields"><label>Frequência<select value={frequency} onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}><option value="daily">Todos os dias</option><option value="weekly">Toda semana</option></select></label>{frequency === "weekly" && <label>Dia<select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>{days.map((day, i) => <option value={i} key={day}>{day}</option>)}</select></label>}<label>Horário<input type="time" required value={time} onChange={(e) => setTime(e.target.value)} /></label></div>
      <label>Executar no desktop<select required value={deviceId} onChange={(e) => setDeviceId(e.target.value)}><option value="">Selecione um desktop</option>{devices.filter((d) => d.kind === "desktop").map((d) => <option value={d.id} key={d.id}>{d.name} ({d.status === "online" ? "online" : "offline"})</option>)}</select></label>
      {error && <p className="form-error">{error}</p>}<p className="automation-note">Fuso horário: {Intl.DateTimeFormat().resolvedOptions().timeZone || "local"}. A automação usa as permissões já concedidas ao desktop.</p><button className="button auth-submit" disabled={busy || !deviceId}>{busy ? "Salvando…" : "Criar automação"}</button>
    </form>
    <div className="automation-list"><h2>Suas rotinas <span>{items.length}</span></h2>{items.length === 0 ? <p className="automation-empty">Nenhuma rotina criada ainda.</p> : items.map((item) => <article className="automation-card" key={item.id}><div className="automation-card-copy"><div><strong>{item.name}</strong><span className={item.enabled ? "automation-state active" : "automation-state"}>{item.enabled ? "Ativa" : "Pausada"}</span></div><p>{item.frequency === "daily" ? "Todos os dias" : `Toda ${days[item.weekday ?? 1]}`} às {item.time} · {item.timezone}</p><small>Próxima execução: {new Date(item.nextRunAt).toLocaleString("pt-BR")}</small></div><div className="automation-actions"><button onClick={() => void action(item.id, "PATCH", { enabled: !item.enabled }).catch((e) => setError(e.message))}>{item.enabled ? "Pausar" : "Ativar"}</button><button onClick={() => void action(item.id, "RUN").catch((e) => setError(e.message))}>Executar agora</button><button onClick={() => void action(item.id, "DELETE").catch((e) => setError(e.message))}>Excluir</button></div></article>)}</div>
  </section></main>;
}
