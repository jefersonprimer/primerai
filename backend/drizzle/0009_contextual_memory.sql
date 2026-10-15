ALTER TABLE memories
  ADD COLUMN origin text NOT NULL DEFAULT 'manual',
  ADD COLUMN source_conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN source_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN valid_until timestamptz;

CREATE TABLE memory_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  use_memories_in_chat boolean NOT NULL DEFAULT true,
  automatic_suggestions_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memory_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  category text NOT NULL DEFAULT 'context',
  source_conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX memory_suggestions_user_status_idx
  ON memory_suggestions(user_id, status, created_at);
