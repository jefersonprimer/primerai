import React from "react";
import ReactDOM from "react-dom/client";
import type { Conversation } from "@primerai/shared";
import { Sidebar } from "./components/Sidebar";
import type { Session } from "./lib/api";
import "./index.css";

const uid = "00000000-0000-0000-0000-000000000000";
const make = (
  id: string,
  title: string,
  model: string,
): Conversation => ({
  id,
  title,
  providerId: uid,
  model,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});

const conversations: Conversation[] = Array.from({ length: 80 }, (_, index) =>
  make(
    `11111111-1111-1111-1111-${String(100000000000 + index)}`,
    `Conversa ${80 - index} — ${
      index % 3 === 0 ? "resumo do relatório de vendas" : "assunto rápido"
    }`,
    index % 2 === 0 ? "gpt-4o-mini" : "claude-3-5-sonnet",
  ),
);

const session: Session = {
  accessToken: "x",
  refreshToken: "x",
  accessExpiresIn: 3600,
  user: { id: uid, email: "joao@email.com", name: null },
};

function Preview() {
  return (
    <main className="chat-shell">
      <Sidebar
        conversations={[
          conversations[1],
          ...conversations.filter((_, index) => index !== 1),
        ]}
        activeConversation={conversations[0].id}
        anonymous={false}
        session={session}
        accountMenuOpen={false}
        onOpenChange={() => undefined}
        onNewChat={() => undefined}
        onToggleAnonymous={() => undefined}
        onSearch={() => undefined}
        onRemote={() => undefined}
        onSelectConversation={() => undefined}
        onDeleteConversation={() => undefined}
        onTogglePin={() => undefined}
        onRenameConversation={() => undefined}
        onAccountClick={() => undefined}
        pinnedIds={[conversations[1].id]}
      />
      <section className="chat-main" style={{ padding: "1rem" }}>
        <p className="muted">prévia</p>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>,
);
