-- Per-note base text size (world-space px). The UI additionally applies a
-- readability floor at low zoom, but this is the size the user sets.
ALTER TABLE notes ADD COLUMN font_size INTEGER NOT NULL DEFAULT 14;
