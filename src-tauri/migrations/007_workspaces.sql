-- Workspaces: a container above boards. Each one holds its own boards and its
-- own appearance, so two of them on the same machine share nothing but the
-- image files on disk and the handful of genuinely global preferences.

CREATE TABLE workspaces (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0
);

-- Everything that exists today becomes one workspace. The id is fixed because
-- a migration cannot generate a uuid; nothing may assume it, and an imported
-- bundle always has its ids remapped, so it can never collide.
INSERT INTO workspaces (id, name, created_at, updated_at, position)
VALUES (
    'ws-personal',
    'Personal',
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    CAST(strftime('%s', 'now') AS INTEGER) * 1000,
    0
);

ALTER TABLE boards ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE boards SET workspace_id = 'ws-personal' WHERE workspace_id IS NULL;
CREATE INDEX idx_boards_workspace ON boards(workspace_id);

-- `settings` has to be rebuilt rather than altered: `key` is its primary key,
-- and two workspaces both need a `theme.name`. SQLite cannot change a primary
-- key in place, so this is the usual copy-and-rename. NULL workspace_id means
-- the setting is global.
CREATE TABLE settings_new (
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    key          TEXT NOT NULL,
    value        TEXT NOT NULL
);

-- Appearance and the last-open board move onto Personal; everything else —
-- the onboarding flag, and the legacy music keys — stays global.
INSERT INTO settings_new (workspace_id, key, value)
SELECT
    CASE
        WHEN key IN ('theme.name', 'theme.custom', 'board.activeId') THEN 'ws-personal'
        ELSE NULL
    END,
    key,
    value
FROM settings;

DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;

-- One row per (scope, key). ifnull() because SQLite treats every NULL as
-- distinct in a unique index, which would let global keys duplicate.
CREATE UNIQUE INDEX idx_settings_scope ON settings(ifnull(workspace_id, ''), key);
