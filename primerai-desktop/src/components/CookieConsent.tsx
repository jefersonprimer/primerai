import { useState } from "react";

const STORAGE_KEY = "primerai-cookie-consent";

type Choice = "accept-all" | "reject-all";

function hasChoice(): boolean {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(() => !hasChoice());

  function decide(choice: Choice) {
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside className="cookie-consent" role="dialog" aria-label="Preferências de cookies">
      <p>
        Usamos cookies para melhorar a experiência, lembrar suas preferências e medir como o
        PrimerAI é usado. Você pode aceitar ou recusar a qualquer momento.
      </p>
      <div className="cookie-consent-actions">
        <button className="primary" onClick={() => decide("accept-all")}>Aceitar todos</button>
        <button className="ghost" onClick={() => decide("reject-all")}>Recusar todos</button>
      </div>
    </aside>
  );
}
