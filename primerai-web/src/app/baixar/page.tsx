import Link from "next/link";
import { downloads } from "@/lib/config";

const groups = [
  { title: "Celular e tablet", items: [{ name: "Android", detail: "Google Play ou APK", url: downloads.android, icon: "◉" }, { name: "iPhone e iPad", detail: "App Store", url: downloads.ios, icon: "⌘" }] },
  { title: "Computador", items: [{ name: "Windows", detail: "Windows 10 ou superior", url: downloads.windows, icon: "▦" }, { name: "macOS", detail: "Apple Silicon e Intel", url: downloads.macos, icon: "◒" }, { name: "Linux", detail: "Pacote para sua distribuição", url: downloads.linux, icon: "⌁" }] },
];

export default function DownloadPage() {
  return <main className="download-page"><nav className="nav wrap"><Link className="brand" href="/">primer<span>ai</span></Link><div><Link href="/">Início</Link><Link className="nav-login" href="/entrar">Entrar</Link></div></nav><section className="download-hero wrap"><div className="eyebrow"><i/> PRIMERAI EM TODO LUGAR</div><h1>Seu espaço vai<br/>com você.</h1><p>Baixe o app no seu celular ou computador. Entre com a mesma conta para continuar seus chats.</p></section><section className="download-groups wrap">{groups.map((group) => <div className="download-group" key={group.title}><h2>{group.title}</h2><div className="download-cards">{group.items.map((item) => <article className="download-card" key={item.name}><span className="download-icon">{item.icon}</span><div className="download-info"><b>{item.name}</b><small>{item.detail}</small></div>{item.url ? <a className="download-action" href={item.url} target="_blank" rel="noreferrer">Baixar <span>↗</span></a> : <span className="coming-soon">Em breve</span>}</article>)}</div></div>)}</section><p className="download-foot wrap">Os links de instalação aparecem aqui quando os pacotes estiverem publicados. <Link href="/criar-conta">Criar uma conta agora →</Link></p><footer className="wrap footer"><Link className="brand" href="/">primer<span>ai</span></Link><span>Feito para continuar de onde você parou.</span><Link href="/">Voltar ao início</Link></footer></main>;
}
