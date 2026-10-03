import { useState } from "react";
import { ApiError, api, type Session } from "../lib/api";

interface AuthScreenProps {
  onAuthenticated: (session: Session) => Promise<void>;
  initialError?: string | null;
}

export function AuthScreen({ onAuthenticated, initialError = null }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const credentials = { email: email.trim(), password };
      const session = mode === "login"
        ? await api.login(credentials)
        : await api.register(credentials);
      await onAuthenticated(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "não foi possível conectar no servidor");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <header className="auth-head">
          <strong>PrimerAI</strong>
          <h1>{mode === "login" ? "Entrar na sua conta" : "Criar sua conta"}</h1>
          <p className="muted">Use a mesma conta do app mobile.</p>
        </header>

        <label className="field">
          <span className="field-label">E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Senha</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            required
          />
        </label>

        {error && <p className="alert error">{error}</p>}

        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
        </button>

        <button
          className="ghost auth-switch"
          type="button"
          disabled={busy}
          onClick={() => {
            setError(null);
            setMode((current) => current === "login" ? "register" : "login");
          }}
        >
          {mode === "login" ? "Ainda não tenho conta" : "Já tenho uma conta"}
        </button>
      </form>
    </main>
  );
}
