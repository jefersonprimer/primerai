ALTER TABLE memories ADD COLUMN category text NOT NULL DEFAULT 'context';
ALTER TABLE memories ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
