"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Device, fetchWithAuth, getSession, listDevices } from "@/lib/api";

type PlanStep = { title: string; instructions: string; completionCriteria: string[]; expectedArtifacts: string[] };
type Plan = { title: string; objective: string; steps: PlanStep[] };
type Mission = { id: string; title: string; objective: string; status: string; progress: number; createdAt: string };
type Step = PlanStep & { id: string; position: number; status: string; output: string | null; error: string | null; taskId: string | null; attempts: number };
type MissionDetail = { mission: Mission; steps: Step[]; events: { id: string; type: string; createdAt: string }[] };
const stateLabel: Record<string, string> = { queued: "Na fila", running: "Em andamento", waiting_approval: "Aguardando aprovação", paused: "Pausada", completed: "Concluída", failed: "Falhou", cancelled: "Cancelada", pending: "Pendente", skipped: "Ignorada" };

export default function MissionsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [objective, setObjective] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [detail, setDetail] = useState<MissionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadMissions = useCallback(async () => {
    const response = await fetchWithAuth("/v1/missions");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Não foi possível carregar as missões.");
    setMissions(data.missions);
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const response = await fetchWithAuth(`/v1/missions/${id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Não foi possível carregar esta missão.");
    setDetail(data);
  }, []);

  useEffect(() => {
    if (!getSession()) { window.location.replace("/entrar"); return; }
    Promise.all([listDevices(), loadMissions()]).then(([found]) => { setDevices(found.filter((d) => d.kind === "desktop")); setDeviceId(found.find((d) => d.kind === "desktop")?.id ?? ""); }).catch((e) => setError(e.message));
  }, [loadMissions]);
  useEffect(() => {
    const timer = window.setInterval(() => { void loadMissions().catch(() => undefined); if (detail) void loadDetail(detail.mission.id).catch(() => undefined); }, 4_000);
    return () => window.clearInterval(timer);
  }, [detail, loadDetail, loadMissions]);

  async function generatePlan(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setPlan(null);
    try {
      const response = await fetchWithAuth("/v1/missions/draft", { method: "POST", body: JSON.stringify({ objective, deviceId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Não foi possível planejar a missão.");
      setPlan(data.plan);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao planejar missão."); } finally { setBusy(false); }
  }
  async function startMission() {
    if (!plan) return;
    setBusy(true); setError("");
    try {
      const response = await fetchWithAuth("/v1/missions", { method: "POST", body: JSON.stringify({ deviceId, plan }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Não foi possível iniciar a missão.");
      setPlan(null); setObjective(""); await loadMissions(); await loadDetail(data.mission.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao iniciar missão."); } finally { setBusy(false); }
  }
  async function missionAction(path: string, method: string, body?: unknown) {
    if (!detail) return;
    const response = await fetchWithAuth(`/v1/missions/${detail.mission.id}${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(data.error?.message || "A ação não foi concluída.");
    await loadMissions(); await loadDetail(detail.mission.id);
  }
  async function retryStep(stepId: string) {
    if (!detail) return;
    const response = await fetchWithAuth(`/v1/missions/${detail.mission.id}/steps/${stepId}/retry`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Não foi possível repetir a etapa.");
    await loadMissions(); await loadDetail(detail.mission.id);
  }
  function editStep(index: number, key: "title" | "instructions", value: string) {
    setPlan((current) => current ? { ...current, steps: current.steps.map((step, i) => i === index ? { ...step, [key]: value } : step) } : current);
  }
  function moveStep(index: number, direction: -1 | 1) {
    setPlan((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.steps.length) return current;
      const steps = [...current.steps]; [steps[index], steps[target]] = [steps[target]!, steps[index]!];
      return { ...current, steps };
    });
  }

  return <main className="account-page"><nav className="nav wrap"><Link href="/" className="brand"><span>✳</span> PrimerAI</Link><div><Link href="/chat">Voltar ao chat</Link></div></nav><section className="wrap mission-page">
    <p className="eyebrow">MODO MISSÃO</p><h1>Um objetivo. Um plano. Até a entrega.</h1><p className="mission-intro">Descreva o resultado que você quer. Revise o plano antes de qualquer tarefa começar e acompanhe cada etapa. Nesta versão, os resultados ficam no histórico; criação de arquivos e execução de testes ainda não são automáticas.</p>
    <form className="mission-create" onSubmit={generatePlan}><label>O que você quer realizar?<textarea required minLength={8} maxLength={2000} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Quero criar um site para uma hamburgueria..." /></label><label>Desktop autorizado<select required value={deviceId} onChange={(e) => setDeviceId(e.target.value)}><option value="">Selecione um desktop</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.status === "online" ? "online" : "offline"}</option>)}</select></label>{error && <p className="form-error">{error}</p>}<button className="button" disabled={busy || !deviceId}>{busy ? "Planejando…" : "Criar plano"}</button></form>
    {plan && <section className="mission-plan"><div className="mission-plan-heading"><div><p className="eyebrow">REVISE ANTES DE INICIAR</p><h2>{plan.title}</h2></div><button className="mission-text-button" onClick={() => setPlan(null)}>Descartar plano</button></div><p className="mission-plan-objective">{plan.objective}</p>{plan.steps.map((step, i) => <article className="mission-plan-step" key={`${i}-${step.title}`}><span>{String(i + 1).padStart(2, "0")}</span><div><input aria-label={`Título da etapa ${i + 1}`} value={step.title} onChange={(e) => editStep(i, "title", e.target.value)} /><textarea aria-label={`Instruções da etapa ${i + 1}`} value={step.instructions} onChange={(e) => editStep(i, "instructions", e.target.value)} /></div><div className="mission-step-reorder"><button type="button" disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label="Mover etapa para cima">↑</button><button type="button" disabled={i === plan.steps.length - 1} onClick={() => moveStep(i, 1)} aria-label="Mover etapa para baixo">↓</button><button type="button" onClick={() => setPlan((current) => current ? { ...current, steps: current.steps.filter((_, index) => index !== i) } : current)} disabled={plan.steps.length <= 1} aria-label="Remover etapa">×</button></div></article>)}<div className="mission-plan-footer"><button type="button" className="mission-text-button" disabled={plan.steps.length >= 20} onClick={() => setPlan({ ...plan, steps: [...plan.steps, { title: "Nova etapa", instructions: "Descreva o trabalho desta etapa.", completionCriteria: [], expectedArtifacts: [] }] })}>＋ Adicionar etapa</button><button className="button" disabled={busy || !plan.steps.every((s) => s.title.trim() && s.instructions.trim())} onClick={() => void startMission()}>Confirmar e iniciar missão</button></div><p className="mission-scope-note">As tarefas usarão somente as permissões e pastas autorizadas para este desktop. Ações que exigem aprovação continuarão pedindo sua confirmação.</p></section>}

    <div className="mission-columns"><section className="mission-list"><h2>Missões <span>{missions.length}</span></h2>{missions.length === 0 ? <p className="mission-muted">Suas missões aparecerão aqui.</p> : missions.map((mission) => <button key={mission.id} className={`mission-list-item ${detail?.mission.id === mission.id ? "selected" : ""}`} onClick={() => void loadDetail(mission.id).catch((e) => setError(e.message))}><span>{mission.title}</span><small>{stateLabel[mission.status] || mission.status}</small><i><b style={{ width: `${mission.progress}%` }} /></i></button>)}</section>
    {detail && <section className="mission-detail"><div className="mission-detail-heading"><div><p className="eyebrow">{stateLabel[detail.mission.status] || detail.mission.status}</p><h2>{detail.mission.title}</h2></div><button className="mission-text-button" onClick={() => setDetail(null)}>Fechar</button></div><p className="mission-detail-objective">{detail.mission.objective}</p><div className="mission-progress"><div><span>Progresso</span><strong>{detail.mission.progress}%</strong></div><i><b style={{ width: `${detail.mission.progress}%` }} /></i></div><div className="mission-controls">{["queued", "running", "waiting_approval"].includes(detail.mission.status) && <button onClick={() => void missionAction("", "PATCH", { action: "pause" }).catch((e) => setError(e.message))}>Pausar</button>}{detail.mission.status === "paused" && <button onClick={() => void missionAction("", "PATCH", { action: "resume" }).catch((e) => setError(e.message))}>Retomar</button>}{["queued", "running", "paused", "waiting_approval"].includes(detail.mission.status) && <button className="danger" onClick={() => void missionAction("/cancel", "POST").catch((e) => setError(e.message))}>Cancelar missão</button>}</div><div className="mission-steps">{detail.steps.map((step) => <article className="mission-step-card" key={step.id}><div className="mission-step-top"><span className={`mission-step-dot ${step.status}`} /> <strong>{step.position + 1}. {step.title}</strong><small>{stateLabel[step.status] || step.status}</small></div><p>{step.instructions}</p>{step.status === "running" && <small className="mission-live">Aguardando resultado do desktop…</small>}{step.status === "waiting_approval" && <small className="mission-live">Aprove ou recuse esta ação no desktop ou na tela de tarefas.</small>}{step.output && <details><summary>Ver resultado da etapa</summary><pre>{step.output}</pre></details>}{step.error && <div className="mission-failure"><p>{step.error}</p>{detail.mission.status === "failed" && <button onClick={() => void retryStep(step.id).catch((e) => setError(e.message))}>Tentar novamente ({step.attempts}/3)</button>}</div>}</article>)}</div></section>}
    </div>
  </section></main>;
}
