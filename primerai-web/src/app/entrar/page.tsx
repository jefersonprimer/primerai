import Link from "next/link";
import { AuthForm } from "@/app/auth-form";

export default function LoginPage() {
  return <main className="auth-layout"><Link className="auth-brand" href="/">primer<span>ai</span></Link><section className="auth-panel"><div className="eyebrow"><i /> BOM TER VOCÊ DE VOLTA</div><h1>Entre no seu espaço.</h1><p className="auth-subtitle">Acesse seus chats e continue de onde parou.</p><AuthForm mode="login"/><p className="auth-legal">Ao continuar, você concorda com os termos de uso e a política de privacidade.</p></section><div className="auth-decoration"><span>✳</span><p>Suas ideias,<br/>sempre por perto.</p><small>PRIMERAI · EM TODOS OS SEUS DISPOSITIVOS</small></div></main>;
}
