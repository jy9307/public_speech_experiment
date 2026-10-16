CREATE SCHEMA IF NOT EXISTS speech_experiment;
CREATE TABLE IF NOT EXISTS speech_experiment.assignments (
  participant_id text PRIMARY KEY,
  condition text NOT NULL CHECK (condition IN ('control','experiment')),
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS speech_experiment.participants (
  id text PRIMARY KEY REFERENCES speech_experiment.assignments(participant_id),
  condition text NOT NULL CHECK (condition IN ('control','experiment')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS speech_experiment.rounds (
  id uuid PRIMARY KEY,
  participant_id text NOT NULL REFERENCES speech_experiment.participants(id),
  number smallint NOT NULL CHECK (number BETWEEN 1 AND 5),
  state text NOT NULL DEFAULT 'ready' CHECK (state IN ('ready','recording','analyzing','analysis_failed','sense','plan','completed')),
  started_at timestamptz,
  recording_ended_at timestamptz,
  completed_at timestamptz,
  interrupted_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  analysis_started_at timestamptz,
  analysis_claim uuid,
  analysis_attempts integer NOT NULL DEFAULT 0,
  analysis_error text,
  analysis jsonb,
  feedback jsonb,
  UNIQUE(participant_id, number)
);
CREATE TABLE IF NOT EXISTS speech_experiment.recordings (
  round_id uuid PRIMARY KEY REFERENCES speech_experiment.rounds(id),
  mime_type text NOT NULL,
  duration_ms bigint NOT NULL CHECK (duration_ms > 0),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  video bytea NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
-- Storage metadata is additive; legacy bytea remains readable during migration.
ALTER TABLE speech_experiment.recordings ADD COLUMN IF NOT EXISTS storage_bucket text;
ALTER TABLE speech_experiment.recordings ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE speech_experiment.recordings ADD COLUMN IF NOT EXISTS storage_generation text;
ALTER TABLE speech_experiment.recordings ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE speech_experiment.recordings ALTER COLUMN video DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='recording_content_present' AND conrelid='speech_experiment.recordings'::regclass) THEN
    ALTER TABLE speech_experiment.recordings ADD CONSTRAINT recording_content_present CHECK
      (video IS NOT NULL OR (storage_bucket IS NOT NULL AND storage_path IS NOT NULL AND storage_generation IS NOT NULL AND sha256 IS NOT NULL));
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS speech_experiment.events (
  id uuid PRIMARY KEY,
  round_id uuid NOT NULL REFERENCES speech_experiment.rounds(id),
  type text NOT NULL,
  screen text NOT NULL,
  component text,
  client_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_round_time ON speech_experiment.events(round_id, client_at);
CREATE TABLE IF NOT EXISTS speech_experiment.responses (
  round_id uuid NOT NULL REFERENCES speech_experiment.rounds(id),
  stage text NOT NULL CHECK (stage IN ('sense','plan')),
  area text NOT NULL CHECK (area IN ('content','organization','expression')),
  field text NOT NULL CHECK (field IN ('comparison','explanation','judgment','goal','strategy','priority')),
  value text NOT NULL,
  updated_at timestamptz NOT NULL,
  event_id uuid NOT NULL REFERENCES speech_experiment.events(id),
  PRIMARY KEY(round_id,stage,area,field)
);
CREATE TABLE IF NOT EXISTS speech_experiment.response_revisions (
  event_id uuid PRIMARY KEY REFERENCES speech_experiment.events(id),
  round_id uuid NOT NULL REFERENCES speech_experiment.rounds(id),
  stage text NOT NULL,
  area text NOT NULL,
  field text NOT NULL,
  before_value text NOT NULL,
  after_value text NOT NULL,
  client_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS speech_experiment.screen_visits (
  id uuid PRIMARY KEY,
  round_id uuid NOT NULL REFERENCES speech_experiment.rounds(id),
  screen text NOT NULL,
  started_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  ended_at timestamptz,
  end_reason text,
  active_ms bigint NOT NULL DEFAULT 0 CHECK (active_ms >= 0)
);
CREATE TABLE IF NOT EXISTS speech_experiment.chat_messages (
  id uuid PRIMARY KEY,
  round_id uuid NOT NULL REFERENCES speech_experiment.rounds(id),
  area text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('sense','plan')),
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  client_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  reply_to uuid REFERENCES speech_experiment.chat_messages(id),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed')),
  context jsonb
);
CREATE INDEX IF NOT EXISTS chat_round_time ON speech_experiment.chat_messages(round_id, received_at);

-- Version 2 timings preserve legacy rows without inferring missing client timestamps.
ALTER TABLE speech_experiment.rounds ADD COLUMN IF NOT EXISTS recording_started_at timestamptz;
ALTER TABLE speech_experiment.rounds ADD COLUMN IF NOT EXISTS upload_started_at timestamptz;
ALTER TABLE speech_experiment.rounds ADD COLUMN IF NOT EXISTS upload_received_at timestamptz;
ALTER TABLE speech_experiment.rounds ADD COLUMN IF NOT EXISTS analysis_completed_at timestamptz;
ALTER TABLE speech_experiment.rounds ADD COLUMN IF NOT EXISTS participant_finished_at timestamptz;
ALTER TABLE speech_experiment.rounds ADD COLUMN IF NOT EXISTS timing_version smallint NOT NULL DEFAULT 1;
ALTER TABLE speech_experiment.rounds ADD COLUMN IF NOT EXISTS recording_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE speech_experiment.chat_messages ADD COLUMN IF NOT EXISTS request_id uuid;
ALTER TABLE speech_experiment.chat_messages ADD COLUMN IF NOT EXISTS generation_started_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS chat_request_unique ON speech_experiment.chat_messages(round_id, request_id) WHERE role='user' AND request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chat_reply_unique ON speech_experiment.chat_messages(reply_to) WHERE role='assistant';
CREATE OR REPLACE VIEW speech_experiment.round_metrics AS
SELECT r.id, r.participant_id, p.condition, a.is_test, r.number, r.state, r.started_at,
  r.recording_ended_at, r.completed_at, r.interrupted_at, r.last_seen_at,
  r.completed_at IS NOT NULL AS completed,
  (SELECT COALESCE(sum(active_ms),0) FROM speech_experiment.screen_visits v WHERE v.round_id=r.id AND screen='sense') AS sense_active_ms,
  (SELECT COALESCE(sum(active_ms),0) FROM speech_experiment.screen_visits v WHERE v.round_id=r.id AND screen='plan') AS plan_active_ms,
  (SELECT COALESCE(sum(extract(epoch FROM (COALESCE(ended_at,last_seen_at)-started_at))*1000),0) FROM speech_experiment.screen_visits v WHERE v.round_id=r.id AND screen='sense') AS sense_residence_ms,
  (SELECT COALESCE(sum(extract(epoch FROM (COALESCE(ended_at,last_seen_at)-started_at))*1000),0) FROM speech_experiment.screen_visits v WHERE v.round_id=r.id AND screen='plan') AS plan_residence_ms,
  EXISTS(SELECT 1 FROM speech_experiment.chat_messages m WHERE m.round_id=r.id AND role='user') AS chat_used,
  (SELECT min(client_at) FROM speech_experiment.events e WHERE e.round_id=r.id AND type='chat_start') AS chat_started_at,
  (SELECT COALESCE(sum((payload->>'durationMs')::bigint),0) FROM speech_experiment.events e WHERE e.round_id=r.id AND type='chat_end') AS chat_active_ms,
  r.recording_started_at, r.upload_started_at, r.upload_received_at, r.analysis_started_at,
  r.analysis_completed_at, r.participant_finished_at, r.timing_version, r.recording_attempts,
  (SELECT count(*) FROM speech_experiment.chat_messages m WHERE m.round_id=r.id AND role='user') AS chat_question_count,
  (SELECT count(*) FROM speech_experiment.chat_messages m WHERE m.round_id=r.id AND role='assistant') AS chat_answer_count
FROM speech_experiment.rounds r JOIN speech_experiment.participants p ON p.id=r.participant_id JOIN speech_experiment.assignments a ON a.participant_id=p.id;
