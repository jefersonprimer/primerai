CREATE TABLE notion_integrations (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token_enc text NOT NULL,
  workspace_id text,
  workspace_name text,
  bot_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
