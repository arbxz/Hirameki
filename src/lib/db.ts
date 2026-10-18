import Database from "@tauri-apps/plugin-sql";

// Single shared connection. Migrations run automatically on load (registered in
// src-tauri/src/lib.rs).
let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:inspo.db").catch((e) => {
      // Never cache a failed load. The file can be briefly unavailable — a
      // second copy of the app starting, or an import that has just finished
      // writing — and caching that rejection poisons every query for the life
      // of the window: the board list comes back empty, the canvas says "this
      // board is empty", and only a restart clears it. Dropping the cache lets
      // the next call try again.
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

/** Drop the cached connection (tests; recovering from a failed load). */
export function resetDb(): void {
  dbPromise = null;
}
