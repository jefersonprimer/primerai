import Link from "next/link";

export default async function NotionCompletePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const connected = status === "connected";
  return (
    <main className="account-page">
      <nav className="nav wrap"><Link className="brand" href="/">primer<span>ai</span></Link></nav>
      <section className="account-card">
        <div className="account-mark">{connected ? "✓" : "!"}</div>
        <span className="eyebrow">INTEGRAÇÃO NOTION</span>
        <h1>{connected ? "Notion conectado." : "Não foi possível conectar."}</h1>
        <p>{connected ? "A IA já pode criar notas no espaço autorizado. Volte ao PrimerAI e atualize o status da integração." : "Volte ao PrimerAI e tente conectar novamente."}</p>
        <div className="hero-actions"><Link className="button button-primary" href="/conta">Abrir conta</Link></div>
      </section>
    </main>
  );
}
