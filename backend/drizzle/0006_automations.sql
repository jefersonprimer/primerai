CREATE TABLE automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  name text NOT NULL,
  prompt text NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly')),
  time text NOT NULL,
  weekday smallint,
  timezone text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((frequency = 'daily' AND weekday IS NULL) OR (frequency = 'weekly' AND weekday BETWEEN 0 AND 6))
);
CREATE INDEX automations_due_idx ON automations(enabled, next_run_at);
CREATE INDEX automations_user_idx ON automations(user_id);
CREATE TABLE automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(automation_id, scheduled_for)
);
