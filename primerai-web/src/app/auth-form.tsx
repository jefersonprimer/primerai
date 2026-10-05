"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiUrl } from "@/lib/config";

type AuthSession = { accessToken: string; refreshToken: string; accessExpiresIn: number; user: { id: string; email: string; name: string | null } };

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (window.location.hash === "#google-error") setError("Não foi possível entrar com Google. Tente novamente ou use e-mail e senha."); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await fetch(`${apiUrl}/v1/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, ...(mode === "register" && name.trim() ? { name: name.trim() } : {}) }),
      });
      const data = await response.json() as { session?: AuthSession; error?: { message?: string } };
      if (!response.ok || !data.session) throw new Error(data.error?.message ?? "Não foi possível acessar sua conta.");
      localStorage.setItem("primerai.session", JSON.stringify(data.session));
      window.location.assign("/chat");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível conectar ao servidor."); }
    finally { setBusy(false); }
  }

  return <><a className="google-button" href="/api/auth/google/start"><span className="google-g">G</span> Continuar com Google</a><div className="auth-divider"><span>ou com seu e-mail</span></div><form className="auth-form" onSubmit={submit}>
    {mode === "register" && <label>Como podemos chamar você?<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} placeholder="Seu nome" /></label>}
    <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="voce@email.com" /></label>
    <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : 1} required placeholder={mode === "register" ? "Pelo menos 8 caracteres" : "Sua senha"} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button-primary auth-submit" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar na conta" : "Criar minha conta"}<span>→</span></button>
    <p className="auth-switch">{mode === "login" ? <>Ainda não tem conta? <Link href="/criar-conta">Criar conta</Link></> : <>Já tem uma conta? <Link href="/entrar">Entrar</Link></>}</p>
  </form></>;
}
