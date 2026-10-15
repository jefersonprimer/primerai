import { useState } from "react";
import { ApiError, api, type Session } from "../lib/api";
import { GoogleIcon } from "./GoogleIcon";

interface AuthScreenProps {
  onAuthenticated: (session: Session) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
  initialError?: string | null;
}

export function AuthScreen({ onAuthenticated, onGoogleSignIn, initialError = null }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const credentials = { email: email.trim(), password };
      const session = mode === "login"
        ? await api.login(credentials)
        : await api.register(credentials, name.trim() || undefined);
      await onAuthenticated(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "não foi possível conectar no servidor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-split-layout">
        <h1 className="auth-title">
          {mode === "login" ? "Entrar na conta" : "Criar uma conta"}
        </h1>

        <div className="auth-card">
          <button
            className="google-auth-button"
            type="button"
            disabled={busy || googleBusy}
            onClick={() => {
              setError(null);
              setGoogleBusy(true);
              void onGoogleSignIn()
                .catch((err) => setError(err instanceof Error ? err.message : "não foi possível iniciar o login Google"))
                .finally(() => setGoogleBusy(false));
            }}
          >
            <GoogleIcon size={18} />
            <span>{googleBusy ? "Abrindo Google…" : "Continuar com Google"}</span>
          </button>

          <div className="auth-divider">
            <span>ou com e-mail</span>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "register" && (
              <div className="field">
                <label htmlFor="auth-name">Nome</label>
                <input
                  id="auth-name"
                  type="text"
                  placeholder="Como podemos chamar você?"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  maxLength={120}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="auth-email">E-mail</label>
              <input
                id="auth-email"
                type="email"
                placeholder="nome@empresa.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="auth-password">Senha</label>
              <input
                id="auth-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={8}
                required
              />
            </div>

            {error && <div className="auth-error-msg">{error}</div>}

            <button className="auth-submit-btn" type="submit" disabled={busy || googleBusy}>
              {busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <div className="auth-footer-toggle">
            <span className="muted">
              {mode === "login" ? "Não tem uma conta?" : "Já tem uma conta?"}
            </span>
            <button
              type="button"
              className="auth-link-btn"
              disabled={busy}
              onClick={() => {
                setError(null);
                setMode((current) => (current === "login" ? "register" : "login"));
              }}
            >
              {mode === "login" ? "Criar conta" : "Fazer login"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
