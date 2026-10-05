"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type User = { email: string; name: string | null };
export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const raw = localStorage.getItem("primerai.session");
    if (!raw) { window.location.replace("/entrar"); return; }
    try { const session = JSON.parse(raw) as { user?: User }; if (!session.user) throw new Error(); setUser(session.user); }
    catch { localStorage.removeItem("primerai.session"); window.location.replace("/entrar"); }
  }, []);
  function logout() { localStorage.removeItem("primerai.session"); window.location.assign("/"); }
  return <main className="account-page"><nav className="nav wrap"><Link className="brand" href="/">primer<span>ai</span></Link><button className="nav-login" onClick={logout}>Sair</button></nav><section className="account-card"><div className="account-mark">✳</div><span className="eyebrow">CONTA PRIMERAI</span><h1>{user?.name ? `Olá, ${user.name}.` : "Sua conta está pronta."}</h1><p>Você entrou como <b>{user?.email ?? ""}</b>. Use a mesma conta nos aplicativos PrimerAI.</p><div className="hero-actions"><Link className="button button-primary" href="/baixar">Baixar os apps <span>↓</span></Link><Link className="button button-secondary" href="/">Voltar ao início</Link></div></section></main>;
}
