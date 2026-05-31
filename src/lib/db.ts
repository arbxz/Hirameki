import Database from "@tauri-apps/plugin-sql";

// Single shared connection. Migrations run automatically on load (registered in
// src-tauri/src/lib.rs).
let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:inspo.db");
  }
  return dbPromise;
}
