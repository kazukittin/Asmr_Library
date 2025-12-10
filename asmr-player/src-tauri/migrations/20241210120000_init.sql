CREATE TABLE works (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rj_code TEXT UNIQUE, -- RJxxxxxx (Nullable for non-RJ works)
    title TEXT NOT NULL,
    dir_path TEXT NOT NULL,
    cover_path TEXT, -- Local path to the jacket image
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    path TEXT NOT NULL,
    duration_sec INTEGER DEFAULT 0,
    track_number INTEGER,
    is_visible BOOLEAN DEFAULT 1, -- False if duplicate format (e.g., MP3 when WAV exists)
    FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
);

CREATE TABLE track_progress (
    work_id INTEGER PRIMARY KEY,
    track_id INTEGER NOT NULL,
    position_sec REAL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
