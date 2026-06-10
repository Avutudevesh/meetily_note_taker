CREATE TABLE IF NOT EXISTS google_calendar_credentials (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS google_calendar_tokens (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at INTEGER NOT NULL,
    account_email TEXT
);

CREATE TABLE IF NOT EXISTS calendar_settings (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    reminder_minutes INTEGER NOT NULL DEFAULT 2
);
