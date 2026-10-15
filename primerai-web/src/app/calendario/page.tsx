"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api";

export default function CalendarPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!localStorage.getItem("primerai.session")) { window.location.replace("/entrar"); return; }
    void fetchWithAuth("/v1/integrations/calendar").then(async (res) => {
      if (!res.ok) throw new Error();
      setConnected(Boolean((await res.json()).connected));
    }).catch(() => setNotice("Não foi possível consultar a integração."));
    const status = new URLSearchParams(window.location.search).get("calendar");
    if (status === "connected") setNotice("Google Calendar conectado. Agora é só pedir um evento no chat.");
    if (status === "error") setNotice("Não foi possível concluir a conexão. Tente novamente.");
  }, []);
  async function toggleConnection() {
    setBusy(true); setNotice("");
    try {
      if (connected) {
        const response = await fetchWithAuth("/v1/integrations/calendar", { method: "DELETE" });
        if (!response.ok) throw new Error("Não foi possível desconectar.");
        setConnected(false); setNotice("Google Calendar desconectado.");
      } else {
        const response = await fetchWithAuth("/v1/integrations/calendar/connect");
        const body = await response.json();
        if (!response.ok || !body.authorizationUrl) throw new Error(body.error?.message || "Não foi possível iniciar a conexão.");
        window.location.assign(body.authorizationUrl);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível atualizar a conexão."); setBusy(false); }
  }
  return <main className="account-page"><nav className="nav wrap"><Link className="brand" href="/">primer<span>ai</span></Link><Link className="nav-login" href="/chat">Voltar ao chat</Link></nav><section className="account-card"><div className="account-mark">◷</div><span className="eyebrow">INTEGRAÇÃO</span><h1>Google Calendar</h1><p>{connected ? "Seu calendário principal está conectado." : "Conecte seu calendário para que a IA possa criar eventos por você."}</p><button className="button button-primary" disabled={busy || connected === null} onClick={toggleConnection}>{busy ? "Aguarde…" : connected ? "Desconectar Google Calendar" : "Conectar Google Calendar"}</button>{notice && <p role="status" style={{ color: "#c8e99a", marginTop: 18 }}>{notice}</p>}<p style={{ fontSize: 13, marginTop: 24, color: "#aab3a7" }}>No chat, por exemplo: “Crie um evento no meu calendário para reunião com Ana amanhã às 14h por uma hora.”</p></section></main>;
}
