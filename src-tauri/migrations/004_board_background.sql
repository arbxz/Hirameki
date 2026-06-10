-- Per-board fixed background image/gif. Exactly one of bg_path (an imported
-- file under the app images dir) or bg_url (a remote link) is used; bg_fit is
-- "cover" or "contain".
ALTER TABLE boards ADD COLUMN bg_path TEXT;
ALTER TABLE boards ADD COLUMN bg_url TEXT;
ALTER TABLE boards ADD COLUMN bg_fit TEXT NOT NULL DEFAULT 'cover';
