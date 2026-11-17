PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS devices (
  expo_token TEXT PRIMARY KEY,
  language TEXT NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'en', 'all')),
  app_version TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_devices_active_language ON devices(active, language);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'all' CHECK (language IN ('ar', 'en', 'all')),
  scheduled_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'sending', 'sent', 'partial', 'failed')),
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  total_targets INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  target_filter TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_notifications_due ON notifications(status, scheduled_at);

CREATE TABLE IF NOT EXISTS notification_receipts (
  ticket_id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  expo_token TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  checked_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ok', 'error')),
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_receipts_pending ON notification_receipts(status, submitted_at);

CREATE TABLE IF NOT EXISTS admin_attempts (
  ip_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
