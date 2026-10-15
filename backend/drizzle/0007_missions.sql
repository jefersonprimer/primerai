CREATE TABLE missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  title text NOT NULL,
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('draft','awaiting_confirmation','queued','running','paused','waiting_approval','completed','failed','cancelled')),
  plan_version integer NOT NULL DEFAULT 1,
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  started_at timestamptz,
  finished_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX missions_user_created_idx ON missions(user_id, created_at);
CREATE INDEX missions_worker_idx ON missions(status, updated_at);

CREATE TABLE mission_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 19),
  title text NOT NULL,
  instructions text NOT NULL,
  completion_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','waiting_approval','completed','failed','skipped','cancelled')),
  output text,
  error text,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  attempts smallint NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mission_id, position)
);
CREATE INDEX mission_steps_queue_idx ON mission_steps(mission_id, status, position);

CREATE TABLE mission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  step_id uuid REFERENCES mission_steps(id) ON DELETE SET NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mission_events_history_idx ON mission_events(mission_id, created_at);
