import Link from "next/link";
import { AuthForm } from "@/app/auth-form";

export default function RegisterPage() {
  return <main className="auth-layout"><Link className="auth-brand" href="/">primer<span>ai</span></Link><section className="auth-panel"><div className="eyebrow"><i /> SEU PRÓXIMO PASSO COMEÇA AQUI</div><h1>Crie sua conta.</h1><p className="auth-subtitle">Um espaço para pensar, criar e fazer acontecer.</p><AuthForm mode="register"/><p className="auth-legal">Ao continuar, você concorda com os termos de uso e a política de privacidade.</p></section><div className="auth-decoration"><span>✳</span><p>Uma ideia de cada vez.<br/>Vamos nessa.</p><small>PRIMERAI · EM TODOS OS SEUS DISPOSITIVOS</small></div></main>;
}
