CREATE TABLE IF NOT EXISTS job_roles (
    title TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    required_skills TEXT NOT NULL,
    optional_skills TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    selected_role TEXT NOT NULL,
    resume_score INTEGER NOT NULL CHECK (resume_score BETWEEN 0 AND 100),
    mode TEXT NOT NULL CHECK (mode IN ('Demo mode', 'AI-assisted')),
    result_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at DESC);
