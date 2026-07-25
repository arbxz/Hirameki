-- Free-form sticky notes on the canvas. Independent of items (no group/rotation);
-- color is a palette key (NULL = follow the theme accent), glass is a 0/1 flag.
CREATE TABLE notes (
    id          TEXT PRIMARY KEY,
    board_id    TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    text        TEXT NOT NULL DEFAULT '',
    x           REAL NOT NULL,
    y           REAL NOT NULL,
    width       REAL NOT NULL,
    height      REAL NOT NULL,
    z           INTEGER NOT NULL DEFAULT 0,
    color       TEXT,                         -- palette key (e.g. "yellow"); NULL = accent tint
    glass       INTEGER NOT NULL DEFAULT 0,   -- 0/1 frosted-glass background
    created_at  INTEGER NOT NULL
);

CREATE INDEX idx_notes_board ON notes(board_id);
