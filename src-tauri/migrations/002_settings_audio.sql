-- Key/value app settings (theme, music state, volume, etc.) and a registry of
-- user-added audio tracks for the background-music feature.

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE tracks (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    -- Exactly one of file_path / src_url is set. file_path is a relative path
    -- under the app audio dir; src_url is a remote stream URL played directly.
    file_path   TEXT,
    src_url     TEXT,
    created_at  INTEGER NOT NULL
);
