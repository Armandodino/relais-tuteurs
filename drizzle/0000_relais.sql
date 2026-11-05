CREATE TABLE relais_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  owner_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL DEFAULT '{"version":1,"tutors":[],"groups":[],"tasks":[],"entries":[]}'
);
