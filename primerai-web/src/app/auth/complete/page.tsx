"use client";

import { useEffect } from "react";

export default function AuthCompletePage() {
  useEffect(() => {
    void fetch("/api/auth/google/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Sessão Google ausente.");
        return response.json() as Promise<unknown>;
      })
      .then((session) => {
        localStorage.setItem("primerai.session", JSON.stringify(session));
        window.location.replace("/conta");
      })
      .catch(() => window.location.replace("/entrar#google-error"));
  }, []);
  return <main className="auth-layout"><section className="auth-panel"><div className="eyebrow"><i /> AUTENTICANDO</div><h1>Preparando seu espaço…</h1><p className="auth-subtitle">Você será redirecionado em instantes.</p></section></main>;
}
