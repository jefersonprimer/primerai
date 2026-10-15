CREATE TABLE chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  original_name text NOT NULL,
  status text NOT NULL DEFAULT 'ready',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_attachments_user_idx ON chat_attachments(user_id);
CREATE INDEX chat_attachments_conversation_idx ON chat_attachments(conversation_id);

CREATE TABLE chat_message_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  position integer NOT NULL,
  type text NOT NULL,
  text text,
  attachment_id uuid REFERENCES chat_attachments(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(message_id, position)
);

CREATE INDEX chat_message_parts_message_idx ON chat_message_parts(message_id);
