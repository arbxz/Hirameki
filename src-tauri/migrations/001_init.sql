-- inspo-board initial schema
PRAGMA foreign_keys = ON;

CREATE TABLE boards (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    -- persisted viewport so the canvas reopens where you left it
    view_x      REAL NOT NULL DEFAULT 0,
    view_y      REAL NOT NULL DEFAULT 0,
    view_zoom   REAL NOT NULL DEFAULT 1
);

CREATE TABLE groups (
    id          TEXT PRIMARY KEY,
    board_id    TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT '',
    x           REAL NOT NULL,
    y           REAL NOT NULL,
    width       REAL NOT NULL,
    height      REAL NOT NULL,
    color       TEXT,
    z           INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
);

CREATE TABLE items (
    id          TEXT PRIMARY KEY,
    board_id    TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    group_id    TEXT REFERENCES groups(id) ON DELETE SET NULL,
    file_path   TEXT,            -- relative path under the app images dir
    src_url     TEXT,            -- original URL when added from a link
    x           REAL NOT NULL,
    y           REAL NOT NULL,
    width       REAL NOT NULL,
    height      REAL NOT NULL,
    rotation    REAL NOT NULL DEFAULT 0,
    z           INTEGER NOT NULL DEFAULT 0,
    natural_w   INTEGER,
    natural_h   INTEGER,
    created_at  INTEGER NOT NULL
);

CREATE INDEX idx_items_board  ON items(board_id);
CREATE INDEX idx_items_group  ON items(group_id);
CREATE INDEX idx_groups_board ON groups(board_id);
