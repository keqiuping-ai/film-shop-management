-- MVP aggregate schema. Credentials are NEVER stored here.
CREATE TABLE IF NOT EXISTS quad_voice_state (
  id integer PRIMARY KEY CHECK (id = 1),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Store.init inserts id=1 with initial() from lib/store.js.
-- Each mutation: BEGIN; SELECT payload ... FOR UPDATE;
-- UPDATE quad_voice_state SET payload=$1, updated_at=now() WHERE id=1; COMMIT;
-- File and PostgreSQL are alternative backends; no automatic file-to-PG import.
