-- Multi-board support: a color tag and an explicit tab order per board.
ALTER TABLE boards ADD COLUMN color TEXT;
ALTER TABLE boards ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Seed the existing default board's position so ordering is stable.
UPDATE boards SET position = 0 WHERE position IS NULL;
