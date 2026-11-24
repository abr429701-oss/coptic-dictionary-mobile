CREATE TABLE IF NOT EXISTS app_update_pushes (
  version TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  sent_at INTEGER,
  audience TEXT NOT NULL,
  target_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0
);
