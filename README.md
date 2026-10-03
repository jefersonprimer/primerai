# PrimerAI

Agente distribuído. Você manda a instrução no celular, ele executa no seu PC — e vice-versa.

```text
App Mobile  ◄──HTTPS/WSS──►  Backend (Fastify)  ◄──WSS──►  Agent Desktop (Tauri + Rust)
                                        │                          │
                                   PostgreSQL                    Tools
                                   (docker compose)        (files, shell, docs)
```

Planejamento completo em [`mvp.md`](./mvp.md).

## Estado atual

Base atual: auth, providers e chat compartilhado. Também há um fluxo inicial de tarefa mobile →
desktop para resumir PDFs, com workspaces locais, acompanhamento por polling e geração de relatório.

Para esse fluxo, entre com a **mesma conta** nos dois apps. No desktop, em **Pastas autorizadas**,
adicione `Downloads` e `Área de trabalho` (há sugestões para pastas padrão). No celular, escreva a
instrução e toque em **Resumir PDFs no PC**. O desktop precisa estar aberto e online.

O desktop usa o executável `pdftotext` do Poppler para ler PDFs com texto. Instale-o e deixe-o no
`PATH`: `poppler-utils` no Linux, `poppler` no macOS, ou Poppler para Windows. PDFs digitalizados
como imagem precisam de OCR, que ainda não está incluído. O processamento atual lê PDFs diretamente
na pasta Downloads, até 20 por tarefa e até 300 mil caracteres no total. O texto extraído é enviado
ao provider de IA configurado; os originais ficam em Downloads e cópias dos PDFs, junto com o
relatório, são salvas em `Trabalho` dentro da pasta autorizada da Área de trabalho. Cópias e relatórios
recebem sufixos numéricos quando necessário para não sobrescrever arquivos existentes.

Esse fluxo é específico para resumo de PDFs; o agent loop genérico, pairing por código, aprovações
e sincronização de artefatos ainda não estão implementados.

## Requisitos

- Node 22+
- pnpm 10
- Docker (só para o Postgres)

## Rodando

```bash
cp .env.example .env
```

Preencha no `.env`:

```bash
POSTGRES_PASSWORD=alguma-senha
DATABASE_URL=postgres://primerai:alguma-senha@localhost:5432/primerai
PRIMERAI_MASTER_KEY=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 48)
JWT_REFRESH_SECRET=$(openssl rand -base64 48)
```

`PRIMERAI_MASTER_KEY` cifra as API keys (AES-256-GCM). Sem ela o backend não sobe.
**Nunca comite essa chave** — perder ela significa perder todas as chaves de provider.

```bash
pnpm install
pnpm infra:up      # sobe o Postgres
pnpm db:migrate    # cria as 15 tabelas
pnpm dev           # backend (:8787) + desktop + mobile
```

Ou separadamente:

```bash
pnpm backend:dev
pnpm desktop:dev
pnpm mobile:dev
```

## Checagens

```bash
pnpm typecheck
pnpm lint
pnpm test           # 27 testes do backend
```

## Como a API key é guardada

```text
chave em claro  →  AES-256-GCM(master key do .env)  →  ai_providers.api_key_enc
                  →  ai_providers.key_hint ("sk-or…7890") pra UI
```

A chave em claro **nunca** sai do backend: nem em `GET /v1/providers`, nem em log.
Todo log passa por `redact()`, que mascara `sk-*`, `sk-or-v1-*`, `AIza*` e `Bearer *`.

Trocar de provider é só apagar e colar outra chave no modal.

## Estrutura

```text
packages/shared/    contratos compartilhados: tipos, schemas Zod, catálogo de tools, rotas
backend/            Fastify 5 + Drizzle + PostgreSQL
primerai-desktop/   Tauri 2 + React 19
primerai-mobile/    Expo SDK 57 + expo-router
docker-compose.yml  PostgreSQL 16
```
