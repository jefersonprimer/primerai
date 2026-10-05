"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { downloads } from "@/lib/config";
import { getSession, User } from "@/lib/api";

const platforms = [
  { label: "Android", detail: "Celular e tablet", href: downloads.android },
  { label: "iPhone e iPad", detail: "iOS e iPadOS", href: downloads.ios },
  { label: "Windows", detail: "Desktop", href: downloads.windows },
  { label: "macOS", detail: "Desktop", href: downloads.macos },
  { label: "Linux", detail: "Desktop", href: downloads.linux },
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const session = getSession();
    if (session?.user) {
      setUser(session.user);
    }
  }, []);

  return (
    <main className="site-shell">
      <nav className="nav wrap">
        <Link className="brand" href="/">
          primer<span>ai</span>
        </Link>
        <div>
          <Link href="/baixar">Baixar apps</Link>
          {user ? (
            <>
              <Link href="/chat" style={{ color: "var(--green)", fontWeight: 600 }}>
                Abrir Chat 💬
              </Link>
              <Link className="nav-login" href="/conta">
                Minha Conta
              </Link>
            </>
          ) : (
            <Link className="nav-login" href="/entrar">
              Entrar
            </Link>
          )}
        </div>
      </nav>

      <section className="hero wrap">
        <div className="hero-copy">
          <div className="eyebrow">
            <i /> UMA IA, EM TODOS OS SEUS DISPOSITIVOS
          </div>
          <h1>
            Leve seu trabalho
            <br />
            mais longe.
          </h1>
          <p>
            Converse com sua IA no celular, web ou computador. O agente que executa no seu PC e você controla de qualquer lugar.
          </p>
          <div className="hero-actions">
            {user ? (
              <Link className="button button-primary" href="/chat">
                Abrir Chat Web <span>↗</span>
              </Link>
            ) : (
              <Link className="button button-primary" href="/criar-conta">
                Criar conta grátis <span>↗</span>
              </Link>
            )}
            <Link className="button button-secondary" href="/baixar">
              Conhecer os apps
            </Link>
          </div>
          <div className="hero-note">
            <span>✳</span> Comece no navegador. Continue onde quiser.
          </div>
        </div>

        <Link href={user ? "/chat" : "/entrar"} style={{ textDecoration: "none" }}>
          <div className="product-art" aria-label="Prévia da interface PrimerAI">
            <div className="art-glow" />
            <div className="art-window">
              <div className="art-top">
                <div className="dots">
                  <i />
                  <i />
                  <i />
                </div>
                <span>
                  primerai <b>✳</b>
                </span>
                <span className="art-avatar">{user?.name ? user.name[0].toUpperCase() : "P"}</span>
              </div>
              <div className="art-content">
                <div className="art-sidebar">
                  <b>✳&nbsp; PrimerAI</b>
                  <span className="art-new">＋ &nbsp; Novo chat</span>
                  <small>RECENTES</small>
                  <span className="art-active">Planejamento semanal</span>
                  <span>Ideias para o projeto</span>
                  <span>Pesquisa de mercado</span>
                </div>
                <div className="art-chat">
                  <span className="art-greeting">Bom dia, Primer <b>✳</b></span>
                  <h2>
                    O que vamos
                    <br />
                    fazer hoje?
                  </h2>
                  <p>Estou aqui para ajudar a tirar suas ideias do papel.</p>
                  <div className="art-prompt">
                    Me ajude a organizar minha semana <span>↑</span>
                  </div>
                  <div className="art-chips">
                    <span>✦ Escrever</span>
                    <span>⌕ Pesquisar</span>
                    <span>▧ Arquivos</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="float-card">
              <span className="float-icon">↗</span>
              <div>
                <b>Seu espaço, em todo lugar</b>
                <small>Celular · Desktop · Web</small>
              </div>
            </div>
          </div>
        </Link>
      </section>

      <section className="download-strip">
        <div className="wrap strip-inner">
          <div>
            <span className="eyebrow">PRIMERAI PARA SEUS DISPOSITIVOS</span>
            <h2>Uma conta. Todos os seus aparelhos.</h2>
          </div>
          <Link className="text-link" href="/baixar">
            Ver opções de download <span>→</span>
          </Link>
        </div>
        <div className="wrap platform-grid">
          {platforms.map((p) => (
            <div className="platform" key={p.label}>
              <span className="platform-icon">
                {p.label === "Android"
                  ? "◉"
                  : p.label === "iPhone e iPad"
                  ? "⌘"
                  : p.label === "Windows"
                  ? "▦"
                  : p.label === "macOS"
                  ? "◒"
                  : "⌁"}
              </span>
              <div>
                <b>{p.label}</b>
                <small>{p.href ? <a href={p.href}>Baixar app ↗</a> : p.detail}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="wrap footer">
        <Link className="brand" href="/">
          primer<span>ai</span>
        </Link>
        <span>Feito para continuar de onde você parou.</span>
        <Link href={user ? "/chat" : "/entrar"}>
          {user ? "Ir para o Chat Web" : "Acessar minha conta"}
        </Link>
      </footer>
    </main>
  );
}
