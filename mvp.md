# PrimerAI — MVP

Agente distribuído: você manda a instrução no celular, ele executa no seu PC (e vice-versa).

> **Meta do MVP:** o usuário instala o app desktop, loga, cola uma API key, conecta o celular, escreve
> *"crie uma pasta Trabalho, pegue os PDFs de Downloads, resuma e gere um relatório em PDF dentro dela"*
> e o sistema executa no PC, com permissões, e mostra o resultado no celular.

---

## 1. Conceito

```text
┌─────────────────┐        HTTPS / WSS        ┌──────────────────┐
│   App Mobile    │◄─────────────────────────►│                  │
│  Expo / RN      │                           │  Backend (API)   │
└─────────────────┘                           │  Auth · AI · Jobs│
                                              │  Providers · Perm│
┌─────────────────┐        HTTPS / WSS        │                  │
│  Agent Desktop  │◄─────────────────────────►└────────┬─────────┘
│  Tauri 2 + Rust │                                    │
└────────┬────────┘                            PostgreSQL (Docker)
         │
    Tools (filesystem, shell, apps, documentos)
```

Responsabilidades (decisão central de arquitetura):

| Camada | Roda onde | Faz o quê |
|---|---|---|
| **Mobile** | Celular | UI, input de texto, streaming, aprovação, preview |
| **Backend** | Servidor | Auth, agent loop, chamada à IA, fila de jobs, permissões, registro |
| **Desktop** | PC do usuário | Execução real das tools (Rust), workspace roots, tray, pairing |

> **Por que o agent loop fica no backend e não no desktop?**
> Uma única implementação, chaves centralizadas, funciona igual no desktop e no mobile,
> e o desktop vira um "executor" fino e seguro. Modo local/offline fica para fases futuras.

---

## 2. Escopo

### Dentro do MVP

- Auth (email + senha), multi-usuário
- Cadastro de **múltiplos providers de IA** (OpenAI, Google Gemini, OpenRouter, Ollama) com chaves cifradas
- App desktop: chat local com agente + execução real de tools
- Pairing desktop ↔ conta (código de 6 dígitos)
- Mobile: chat que despacha tarefa para um device, com progresso ao vivo
- Catálogo de tools com **3 níveis de permissão**
- Workspaces (pastas autorizadas) como boundary de segurança
- Jobs assíncronos com estados e histórico
- Artefatos com metadados + download opcional
- Docker Compose com PostgreSQL

### Fora do MVP (mas o desenho já suporta)

- Memória / preferências persistentes
- Automações (cron)
- Plugins de tools da comunidade
- Execução local sem backend
- Marketplace / billing
- Multi-agente

---

## 3. Stack

| Parte | Escolha | Nota |
|---|---|---|
| Desktop | **Tauri 2** + React 19 + TS + Rust | já scaffolded em `primerai-desktop/` |
| Mobile | **Expo SDK 57** + expo-router + TS | já scaffolded em `primerai-mobile/` |
| Backend | **Node 22 + TypeScript + Fastify** | leve,-first, WS nativo, fácil de self-hostar |
| Validação | **Zod** | gera contrato compartilhado |
| ORM / DB | **PostgreSQL 16** + Drizzle ORM | SQL explícito, migrations versionadas |
| Tempo real | **WebSocket** (`@fastify/websocket`) | 1 canal bidirecional |
| Auth | JWT (access curto) + refresh rotativo, **argon2id** | |
| Criptografia | chaves via **AES-256-GCM**, master key em env | |
| PDF/DOCX/XLSX | `pdf-lib`, `docx`, `exceljs` (lado Rust ou Node) | ver F10 |
| Monorepo | pnpm workspaces | |

Layout real (julho/2026 — primeira entrega):

```text
primerai/
├── mvp.md
├── docker-compose.yml          # Postgres 16
├── .env.example
├── package.json                # pnpm workspace
├── pnpm-workspace.yaml
├── packages/
│   └── shared/                 # tipos + schemas Zod + catálogo de tools + rotas
├── backend/                    # Fastify 5 + Drizzle + PostgreSQL
│   ├── src/
│   │   ├── server.ts           # boot + migrations no start
│   │   ├── app.ts              # plugins, error handler, health
│   │   ├── config.ts           # env validado com Zod
│   │   ├── ai/registry.ts      # adapters openai/google/openrouter/ollama
│   │   ├── db/                 # schema, client, migrations, repos
│   │   ├── lib/                # crypto (AES-GCM, redaction), auth-crypto
│   │   ├── plugins/auth.ts     # Bearer / ?access_token / cookie
│   │   └── routes/             # auth, providers
│   ├── drizzle/                # SQL gerado
│   └── test/                   # node:test
├── primerai-desktop/           # Tauri 2 + React 19
└── primerai-mobile/            # Expo SDK 57 + expo-router
```

> Os apps mobile e desktop já existiam como scaffolds e foram mantidos no lugar para
> não quebrar nada. `apps/` fica para quando houver motivo para mover.

---

## 4. Roadmap

Ordem deliberada: **primeiro funciona local, depois distribui.**

> Status: ✅ = feito e testado. As Fases 0–2 e o gate do modal de API key nos dois apps
> estão concluídos; o agente loop é o próximo bloco.

### Fase 0 — Fundação ✅
- [x] Monorepo pnpm + `packages/shared`
- [x] `docker-compose.yml` com PostgreSQL + healthcheck + volume
- [x] Backend Fastify + pool de DB + migration inicial (15 tabelas)
- [x] `.env.example` documentado
- [x] `pnpm typecheck` / `lint` / `test` nos 4 pacotes

### Fase 1 — Providers + modal de API key ✅
> **Esta é a primeira tela dos dois apps: modal pedindo API key.**

- [x] Tabela `ai_providers` + cifrado AES-256-GCM
- [x] `AIProvider` interface + adapters `openai`, `google`, `openrouter`, `ollama`
- [x] `GET /v1/providers/:id/models` (descobrir modelos com a chave)
- [x] `POST /v1/providers/:id/test` (valida a chave, erro normalizado)
- [x] **Modal de primeira abertura** no desktop e no mobile (ver §6)
- [x] Listar / adicionar / remover provider, com default automático e nunca ficar sem default

### Fase 2 — Auth ✅
- [x] register / login / refresh com rotação / logout
- [x] `GET /v1/me`
- [x] Sessão em `localStorage` (desktop) e `expo-secure-store` (mobile)
- [x] Desktop cria conta local de instalação no 1º boot (sem pedir e-mail); o pairing é o
      que amarra essa conta à conta real
- [x] Mobile pede e-mail/senha (o pairing ainda não existe, então é o único caminho)
- [ ] `argon2id` no lugar do scrypt quando houver login web com rate limit apertado

### Fase 3 — Tools (o coração) 🟡
- [x] Executor Rust restrito ao fluxo PDF: listar PDFs, extrair texto, criar pasta e escrever PDF
- [x] Toda operação local confere o caminho dentro dos workspaces autorizados
- [ ] Catálogo e executor genéricos (`fs.*`, `shell.*`, `app.*`)
- [ ] **Permission gate**: `safe` | `confirm` | `blocked`, dry-run e `audit_log`

### Fase 4 — Agent loop local (desktop standalone) 🟡
- [x] Workspaces configuráveis no desktop; o executor de resumo só atua neles
- [x] Fluxo específico de resumo de PDFs e criação de relatório PDF
- [ ] Chat local com streaming, tool calling genérico e limite de iterações
- [ ] UI de aprovação com preview
- [ ] Criação de DOCX / XLSX

### Fase 5 — Backend com jobs 🟡
- [x] Criação e consulta de tarefas; desktop reclama tarefas via polling HTTP e publica progresso/resultado
- [ ] Worker de fila com retry, backoff e cancelamento
- [ ] Streaming de progresso por WS

### Fase 6 — Pairing desktop ↔ conta 🟡
- [x] Associação inicial autenticando desktop e mobile na mesma conta; registro e heartbeat do desktop
- [ ] Desktop exibe código de 6 dígitos (válido 10 min)
- [ ] Usuário cola o código no app
- [ ] Desktop recebe `agent_token` de longa duração
- [ ] Heartbeat + status online/offline
- [ ] Tela "Meus dispositivos"

### Fase 7 — App mobile agent 🟡
- [x] Escolha de desktop online, envio de tarefa de resumo e progresso/resultado por polling
- [ ] Aprovações, lista de artifacts com preview/download e histórico dedicado

### Fase 8 — Polish de MVP ⬜
- [ ] Teste e2e do cenário de aceitação (§16)
- [ ] Tray icon + notificação no desktop
- [ ] Onboarding
- [ ] Documentação open source (README, CONTRIBUTING)

### Depois do MVP ⬜
- [ ] Memória / preferências (tabelas já existem)
- [ ] Automações (cron) — tabela `schedules` já existe
- [ ] Plugins de tools da comunidade

---

## 5. Modelo de dados

```sql
-- Identidade
users(id uuid pk, email citext unique, name text, password_hash text,
      created_at timestamptz, updated_at timestamptz)

sessions(id uuid pk, user_id fk, refresh_token_hash text,
         user_agent text, expires_at, revoked_at, created_at)

-- IA
ai_providers(id uuid pk, user_id fk, provider text,      -- openai|google|openrouter|ollama
             label text, base_url text,
             api_key_enc bytea, key_hint text,            -- ex: "sk-...f3a9"
             default_model text, is_default bool,
             created_at, last_used_at)

-- Dispositivos
devices(id uuid pk, user_id fk, kind text,               -- desktop|mobile
         name text, platform text, os_version text,
         agent_version text, status text,                 -- online|offline
         last_seen_at, created_at)

device_tokens(id uuid pk, device_id fk, token_hash text,
              scopes text[], expires_at, revoked_at, created_at)

pairings(id uuid pk, user_id fk, code text unique, expires_at,
         claimed_by_device_id fk null, created_at)

-- Segurança / escopo
workspaces(id uuid pk, user_id fk, device_id fk, label text,
           path text, enabled bool, created_at)

-- Execução
tasks(id uuid pk, user_id fk, device_id fk, prompt text,
      provider_id fk, model text,
      status text,          -- pending|running|waiting_approval|completed|failed|cancelled
      progress smallint, step_label text,
      input jsonb, output jsonb, error text,
      created_at, started_at, finished_at)

task_events(id uuid pk, task_id fk, seq int, type text, payload jsonb, created_at)

tool_calls(id uuid pk, task_id fk, seq int, tool text, args jsonb,
           result jsonb, status text, duration_ms int)

approvals(id uuid pk, task_id fk, tool_call_id fk, tool text, args jsonb,
          risk text, impact_summary text,
          status text,       -- pending|approved|denied|expired|auto
          expires_at, resolved_at)

artifacts(id uuid pk, task_id fk, name text, path text, mime text,
          size_bytes bigint, uploaded bool, storage_key text, created_at)

audit_log(id uuid pk, user_id fk, device_id fk, task_id fk,
          tool text, args_digest text, outcome text, created_at)

-- Fase futura
memories(id uuid pk, user_id fk, key text, value jsonb,
         source_task_id fk, created_at)
schedules(id uuid pk, user_id fk, device_id fk, cron text, prompt text, enabled bool)
```

---

## 6. Providers de IA + modal de API key

### 6.1 Interface

```ts
export type ProviderId = 'openai' | 'google' | 'openrouter' | 'ollama';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface AIProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly defaultBaseUrl: string;
  /** Modelo default sugerido quando o usuário não escolhe. */
  readonly suggestedModel: string;

  validate(apiKey: string, baseUrl?: string): Promise<{ ok: true; org?: string } | { ok: false; error: string }>;
  listModels(ctx: ProviderCtx): Promise<AIModel[]>;
  /** Stream de tokens + deltas de tool call. */
  stream(ctx: ProviderCtx, req: AIRequest): AsyncIterable<AIStreamChunk>;
}
```

Adapters:

| provider | baseUrl default | auth | notas |
|---|---|---|---|
| `openai` | `https://api.openai.com/v1` | `Authorization: Bearer` | tool calling nativo |
| `google` | `https://generativelanguage.googleapis.com/v1beta` | `x-goog-api-key` | `functionDeclarations` |
| `openrouter` | `https://openrouter.ai/api/v1` | `Authorization: Bearer` | compatível OpenAI, manda `HTTP-Referer`/`X-Title` |
| `ollama` | `http://localhost:11434` | — | opcional, sem key |

Todos passam por um **retry com backoff** e **normalização de erro** (401 → "chave inválida",
429 → "rate limit", sem vazar a chave nos logs).

### 6.2 Armazenamento seguro

```text
api_key_enc = AES-256-GCM(master_key, api_key)   // IV aleatório 12 bytes, auth tag
key_hint    = "sk-…f3a9"                          // últimos 4, para UI
```

- `PRIMERAI_MASTER_KEY` (32 bytes, base64) **nunca** vai para o client nem para o repositório
- API key **nunca** é devolvida pela API — só `key_hint`
- No desktop, espelho opcional em **keychain do SO** (`keyring`) para funcionar offline
- Log de requisição sempre com a chave redigida: `sk-…f3a9`

### 6.3 O modal (primeira tela dos dois apps)

**Desktop** — abre como modal bloqueante antes de qualquer tela de chat:

```text
┌──────────────────────────────────────────────┐
│           Conectar sua IA                    │
│                                              │
│  Escolha um provedor                          │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│  │ OpenAI │ │ Google │ │OpenRout│ │Ollama  │ │
│  └────────┘ └────────┘ └────────┘ └────────┘ │
│                                              │
│  OpenRouter                                  │
│  ┌────────────────────────────────────────┐  │
│  │ sk-or-v1-…                            │  │
│  └────────────────────────────────────────┘  │
│  [👁 mostrar]  [🔗 obter chave]              │
│                                              │
│  Modelo                                      │
│  ┌────────────────────────────────────────┐  │
│  │ anthropic/claude-sonnet-4  ▼           │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  [Validar e continuar]                       │
└──────────────────────────────────────────────┘
```

Comportamento:

1. App detecta `GET /v1/me/providers` → se **zero providers**, força o modal (não deixa navegar)
2. Botão "Validar" chama `POST /v1/providers/test`; em erro mostra a mensagem específica
   ("chave inválida", "sem permissão no modelo", "sem internet")
3. "Descobrir modelos" preenche o select via `GET /v1/providers/:id/models`
4. Salva com `POST /v1/providers` e marca `is_default`
5. Modal só reaparece se o usuário remover todas as chaves, ou em "Configurações → Trocar provedor"
6. Estado vazio depois: modal **não bloqueia** — vira um card "Conectar sua IA para começar"

**Mobile** — mesmo modal, mesmo componente visual (design system compartilhado em `packages/shared/ui-tokens`):

```text
┌─────────────────────────┐
│ Conectar sua IA         │
│                         │
│ ( OpenAI ) ( Google )    │
│ ( OpenRouter ) ( Ollama)│
│                         │
│ ┌─────────────────────┐ │
│ │ cole sua chave…     │ │
│ └─────────────────────┘ │
│ Modelo ▼                │
│                         │
│ [ Validar e continuar ] │
└─────────────────────────┘
```

> No mobile a chave é opcional: o device pode só **controlar** o PC. Se não houver provider no
> celular, o botão diz "Configurar depois" e o app entra em modo "controle remoto".
> As tasks executadas a partir do celular usam o provider do **desktop**, salvo se o usuário
> escolher explicitamente outro.

---

## 7. Sistema de Tools

A IA **nunca** executa código arbitrário. Ela escolhe entre tools declaradas, com JSON Schema.

### 7.1 Catálogo do MVP

```jsonc
// fs.list_directory
{ "name": "fs.list_directory",
  "description": "Lista o conteúdo de um diretório dentro de um workspace autorizado.",
  "parameters": { "type": "object",
    "properties": { "path": { "type": "string" },
                    "recursive": { "type": "boolean", "default": false } },
    "required": ["path"] } }
```

| Tool | Risco | Assinatura |
|---|---|---|
| `fs.list_directory` | safe | `(path, recursive?)` |
| `fs.read_file` | safe | `(path, maxBytes?)` |
| `fs.search_files` | safe | `(query, root?, pattern?, limit?)` |
| `fs.write_file` | safe | `(path, content, mode: create\|overwrite)` |
| `fs.create_directory` | safe | `(path)` |
| `fs.move_file` | confirm | `(from, to, overwrite?)` |
| `fs.copy_file` | confirm | `(from, to)` |
| `fs.delete_path` | **confirm** | `(path, recursive?)` → mostra contagem de itens |
| `doc.create_pdf` | safe | `(path, title, sections[])` |
| `doc.create_docx` | safe | `(path, title, blocks[])` |
| `doc.create_xlsx` | safe | `(path, sheets[])` |
| `app.open` | confirm | `(target: path\|url\|app)` |
| `shell.execute` | **confirm** | `(command, cwd?, timeoutMs?)` + allowlist |
| `project.scaffold` | confirm | `(path, template: react\|node\|python\|blank)` |

### 7.2 Executor (Rust, desktop)

```rust
#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum ToolOutcome {
    Ok { data: serde_json::Value },
    NeedsApproval { impact: ImpactSummary },
    Denied { reason: String },
    Error { code: String, message: String },
}

pub trait Tool {
    fn spec(&self) -> ToolSpec;
    fn risk(&self) -> Risk;
    fn call(&self, ctx: &ToolCtx, args: Value) -> Result<ToolOutcome>;
}
```

Regras não negociáveis no executor:

- Todo path é canonicalizado e **precisa** estar dentro de um `workspace` habilitado
- Todo `shell.execute` passa por denylist (`rm -rf /`, `:(){:|:&};:`, `mkfs`, `dd of=/dev/`, `shutdown`,
  `curl | sh`, edição de `/etc`, chaves SSH) e allowlist de binários no MVP
- Timeout em todo comando (default 30s) e limite de output (default 64 KB)
- Segredos nunca entram em log nem no resultado de tool

### 7.3 Níveis de permissão

```text
safe     → executa e mostra no chat o que foi feito
confirm  → a UI mostra a ação e espera o usuário
blocked  → recusado, com explicação
```

Exemplo de UI para `confirm`:

```text
🤖 Vou executar:

  delete_path(~/Downloads/*)

⚠️ Vai excluir 347 arquivos (12,4 MB).
   Exemplo: relatório-2024.pdf, notas.txt, …

[ Cancelar ]  [ Permitir uma vez ]  [ Permitir sempre ]
```

"Permitir sempre" grava uma regra em `settings.auto_approve: { tool, pathGlob }`.

### 7.4 Agent loop

```text
loop (max 12 iterações):
  1. model = resolveProvider(task.provider)
  2. stream(model, system_prompt + messages + toolSpecs)
  3. se stream pediu tool calls:
       para cada call:
         se risk == blocked  → devolve erro para a IA e continua
         se risk == confirm  → grava approval, status = waiting_approval, PAUSA o loop
                              (retoma quando o usuário aprovar/negar)
         senão               → executa, anexa resultado
  4. se a IA respondeu texto final → status = completed
  5. se estourou iterações        → status = failed com aviso
```

System prompt base: identidade, idioma do usuário, **workspaces permitidos**, tools disponíveis,
regras de segurança ("nunca saia dos workspaces", "peça confirmação verbal para ações destrutivas"),
formato de resposta curto.

---

## 8. Jobs e tempo real

### Estados

```text
pending ──▶ running ──▶ completed
              │
              ├──▶ waiting_approval ──▶ running
              ├──▶ failed
              └──▶ cancelled
```

### Envelope de WebSocket (v1)

```json
{
  "v": 1,
  "id": "uuid",
  "type": "task.progress",
  "ts": "2026-01-01T12:00:00.000Z",
  "payload": {}
}
```

| type | direção | payload |
|---|---|---|
| `device.hello` | D→B | `{ agentVersion, platform }` |
| `device.heartbeat` | D→B | `{}` (a cada 20s) |
| `device.status` | B→todos | `{ deviceId, status }` |
| `task.created` | B→todos | `{ task }` |
| `task.dispatch` | B→D | `{ taskId, prompt, providerId, model, workspaces }` |
| `task.status` | B→todos | `{ taskId, status, progress, stepLabel }` |
| `task.delta` | B→mobile | `{ taskId, text }` (streaming do texto) |
| `task.artifact` | B→todos | `{ taskId, artifact }` |
| `task.tool_call` | B→todos | `{ taskId, tool, args, status }` |
| `task.done` | B→todos | `{ taskId, status, output, error }` |
| `approval.request` | B→D+mobile | `{ approvalId, tool, args, impact }` |
| `approval.resolved` | D→B | `{ approvalId, decision }` |
| `task.cancel` | B→D | `{ taskId }` |

Fallback: `GET /v1/tasks/:id/events` (SSE) quando o WS cai.

### UI de progresso (mobile)

```text
🤖 Analisando PDFs de Downloads…

  ████████░░  80%   Lendo 24 de 30 arquivos
  ✓ fs.list_directory  ~/Downloads
  ⣾ fs.read_file       relatorio-2024.pdf
  ⋯ aguardando seu ok  → delete_path
```

---

## 9. Workspaces (boundary de segurança)

No primeiro run, o desktop sugere:

```text
Permitir o agente em:

  ☑ Documentos     ~/Documents
  ☑ Projetos       ~/Projects
  ☑ Área de trabalho ~/Desktop
  ☐ Downloads      ~/Downloads
  ☐ Tudo           ~/
```

Regra: **fora dos workspaces marcados, o agente não existe.** Isso é o que separa "agente útil" de
"agente perigoso", e é o argumento principal para open source.

---

## 10. Geração de documentos

| Formato | Biblioteca | Onde roda | Artefato |
|---|---|---|---|
| PDF | `pdf-lib` (Node) ou `printpdf` (Rust) | backend gera, desktop salva | `relatorio.pdf` |
| DOCX | `docx` | backend | `curriculo.docx` |
| XLSX | `exceljs` | backend | `dados.xlsx` |
| MD/TXT/CSV | nativo | backend | `notas.md` |

O **conteúdo** é gerado pelo backend (que tem a IA e a key). O arquivo é **escrito** pelo desktop
dentro de um workspace. O `artifacts` guarda metadados sempre e, se o usuário marcar "enviar para o
celular", o desktop faz upload criptografado.

---

## 11. Backend — endpoints

```text
AUTH
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
POST   /v1/auth/logout
GET    /v1/me

PROVIDERS
GET    /v1/providers
POST   /v1/providers                 { provider, apiKey, baseUrl?, label? }
GET    /v1/providers/:id             (sem a key, só key_hint)
PATCH  /v1/providers/:id
DELETE /v1/providers/:id
POST   /v1/providers/:id/test
GET    /v1/providers/:id/models

DEVICES
GET    /v1/devices
POST   /v1/devices/pairings          gera código de 6 dígitos
POST   /v1/pairings/claim            { code, deviceName }
DELETE /v1/devices/:id

WORKSPACES
GET    /v1/workspaces
PUT    /v1/workspaces                { deviceId, items: [{label, path, enabled}] }

TASKS
POST   /v1/tasks                     { prompt, deviceId, providerId?, model? }
GET    /v1/tasks                     ?status&deviceId&limit
GET    /v1/tasks/:id
POST   /v1/tasks/:id/cancel
GET    /v1/tasks/:id/events          SSE
GET    /v1/tasks/:id/artifacts

APPROVALS
POST   /v1/approvals/:id/approve     { always?: boolean }
POST   /v1/approvals/:id/deny

ARTIFACTS
GET    /v1/artifacts/:id
GET    /v1/artifacts/:id/content

WS
GET    /v1/ws                        app (user token)
GET    /v1/agent/ws                  desktop (agent token)
```

Erros: sempre `{ error: { code, message, details? } }` com os mesmos `code` no mobile e no desktop.

---

## 12. Mobile — telas

```text
src/app/
├── _layout.tsx              # providers (auth, settings, agent socket)
├── index.tsx                # redireciona: sem sessão → onboarding, sem key → modal, senão → chat
├── onboarding.tsx
├── providers/
│   ├── api-key-modal.tsx    # ← primeiro modal
│   └── settings.tsx
├── chat/
│   ├── index.tsx            # conversa + composer
│   ├── task-card.tsx        # status/progresso/aprovação inline
│   └── device-picker.tsx    # "Executar no: PC-Jeferson ▼"
├── devices/
│   ├── index.tsx            # lista com online/offline
│   └── pair.tsx             # cola código do desktop
├── tasks/index.tsx          # histórico
├── artifacts/[id].tsx       # preview/download
└── settings/
    ├── workspaces.tsx
    └── permissions.tsx      # regras de auto-approve
```

## 13. Desktop — telas

```text
src/
├── App.tsx                  # gate: sem sessão? sem key? → modal
├── screens/
│   ├── Chat.tsx             # chat local + tasks remotas
│   ├── Devices.tsx          # pairing, código, status
│   ├── Workspaces.tsx       # pastas autorizadas
│   ├── Permissions.tsx      # regras e histórico de auditoria
│   └── Settings.tsx         # providers, modelo, tema
├── components/
│   ├── ApiKeyModal.tsx      # ← primeiro modal (mesmo design do mobile)
│   ├── ApprovalCard.tsx
│   ├── TaskProgress.tsx
│   └── ArtifactChip.tsx
└── lib/
    ├── agent/               # loop local, tool bridge
    ├── rpc.ts               # invoke wrappers do Rust
    └── api.ts               # client HTTP + WS

src-tauri/src/
├── main.rs
├── lib.rs                   # setup, tray, estado global
├── tools/
│   ├── mod.rs               # registro + dispatch + risk
│   ├── fs.rs
│   ├── shell.rs
│   ├── apps.rs
│   └── docs.rs
├── policy.rs                # workspaces, risk, deny/allow, audit
├── bridge.rs                # WS com o backend (tasks remotas)
└── keyring.rs               # cache local da key
```

---

## 14. Docker Compose (PostgreSQL)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: primerai-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-primerai}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?defina POSTGRES_PASSWORD no .env}
      POSTGRES_DB: ${POSTGRES_DB:-primerai}
      # performance ok para dev, e nada de trust em rede pública
      POSTGRES_INITDB_ARGS: "--locale=C.UTF-8"
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - primerai-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-primerai} -d ${POSTGRES_DB:-primerai}"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s

volumes:
  primerai-pgdata:
```

Extras previstos para o compose (mais tarde): `api` (backend), `redis` (fila), `adminer`.

### `.env.example`

```bash
POSTGRES_USER=primerai
POSTGRES_PASSWORD=
POSTGRES_DB=primerai
POSTGRES_PORT=5432

DATABASE_URL=postgres://primerai:senha@localhost:5432/primerai
PRIMERAI_MASTER_KEY=            # 32 bytes base64: openssl rand -base64 32
JWT_SECRET=
JWT_REFRESH_SECRET=
PORT=8787
PUBLIC_URL=http://localhost:8787

# apps
NEXT_PUBLIC_API_URL=            # ou EXPO_PUBLIC_API_URL no mobile
VITE_API_URL=
```

---

## 15. Scripts de dev

```bash
docker compose up -d postgres
pnpm install
cp .env.example .env            # preencher
pnpm db:migrate
pnpm dev                        # sobe backend (:8787) + desktop + mobile juntos
pnpm desktop:dev                # tauri dev
pnpm mobile:dev                 # expo start
pnpm typecheck && pnpm lint && pnpm test
```

---

## 16. Critério de aceitação do MVP

O teste que define se o MVP passou:

> 1. Usuário abre o app desktop → **modal de API key** aparece → cola chave do OpenRouter → valida →
>    escolhe modelo → entra no app.
> 2. Configura workspaces (Documentos, Downloads).
> 3. Desktop mostra código de pareamento → usuário cola no celular → celular lista "PC-Jeferson 🟢".
> 4. No celular: *"crie uma pasta Trabalho, pegue os PDFs de Downloads, faça um resumo, gere um
>    relatório em PDF e salve dentro da pasta Trabalho."*
> 5. No celular aparece: progresso ao vivo, as tools sendo executadas, e o resultado.
> 6. No desktop: a pasta e o PDF existem.
> 7. Repetir com uma ação destrutiva → aparece o card de confirmação; negar → IA é avisada e para.

Se os 7 passos funcionam, é um agente de verdade.

---

## 17. Riscos e decisões abertas

| Tema | Decisão recomendada |
|---|---|
| Backend self-hosted obrigatório? | Não. O MVP exige backend, mas o desenho do `AIProvider` já permite desktop-local depois. |
| E-mail transacional (pairing por e-mail)? | Não no MVP — pairing por código evita dependência de SMTP. |
| Onde a IA roda? | Backend. Desktop-local é fase futura. |
| Streaming com provider sem support? | Normalizar tudo pra um stream interno; sem support → resposta completa em um chunk. |
| Multi-monetário / modelo caro no celular? | Sempre usar o provider escolhido explicitamente; mostrar custo estimado no desktop. |
| Criptografia da key | AES-256-GCM com master key em env; rotação de key documentada. |
| Path traversal em tools | Canonicalização + checagem de prefixo de workspace em **todas** as tools, sem exceção. |
| Logs | Nunca logar prompt com key, argumentos de tool com segredo, nem response body crua. |
| Rate limiting | `rate-limiter-flexible` no Fastify por IP e por user. |

---

## 18. Ordem de ataque (próximos passos concretos)

**Concluído** ✅
1. `docker-compose.yml` + `.env.example` + backend conectado no Postgres
2. `packages/shared` com schemas Zod, catálogo de tools e rotas
3. 15 tabelas + migration rodando no boot
4. `POST /v1/providers` com cifrado AES-256-GCM
5. Adapters de provider + `/test` + `/models`
6. **Modal de API key no desktop** (primeira tela)
7. Auth + `GET /v1/me`
8. **Modal de API key no mobile** + login
9. 27 testes unitários (crypto, auth, catálogo)

**Próximo** ⬜
10. Agent loop no backend com tool calling (o mais importante — destrava todo o resto)
11. Primeiro tool real em Rust: `fs.create_directory`, e o permission gate
12. Chat local no desktop sobre o agent loop
13. Mais tools de `fs` → `doc.*`
14. `shell.execute` com allowlist/denylist + UI de aprovação
15. Workspaces como boundary
16. Tasks/jobs + WS
17. Pairing
18. Chat mobile despachando para o PC
