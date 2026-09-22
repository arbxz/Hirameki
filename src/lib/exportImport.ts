import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getDb } from "./db";

// Full board export/import. A bundle is a single JSON file containing every DB
// row (boards/groups/items/tracks/settings) plus the actual image & audio bytes
// (base64, embedded by the Rust side) so it's portable across machines.
//
// Tracks and audio are legacy (the music widget is gone) but still round-trip,
// because import wipes every table first: dropping them here would delete
// them from the target machine.
//
// JS owns DB read/write (via the sql plugin); Rust owns reading/writing the
// asset files and the bundle file itself (unrestricted std::fs).

// FK-safe insertion order (parents before children).
const INSERT_ORDER = ["boards", "groups", "items", "notes", "tracks", "settings"];
// Wipe order (children before parents).
const WIPE_ORDER = ["items", "notes", "groups", "tracks", "settings", "boards"];

// Allowed columns per table (matches the migrations). Used to validate an
// imported manifest before applying it: this both rejects foreign/corrupt
// bundles and keeps the dynamically-built INSERTs free of attacker-controlled
// identifiers (column/table names can't be parameterized).
const TABLE_COLUMNS: Record<string, ReadonlySet<string>> = {
  boards: new Set([
    "id", "name", "created_at", "updated_at", "view_x", "view_y", "view_zoom",
    "color", "position", "bg_path", "bg_url", "bg_fit",
  ]),
  groups: new Set([
    "id", "board_id", "title", "x", "y", "width", "height", "color", "z",
    "created_at",
  ]),
  items: new Set([
    "id", "board_id", "group_id", "file_path", "src_url", "x", "y", "width",
    "height", "rotation", "z", "natural_w", "natural_h", "created_at",
  ]),
  notes: new Set([
    "id", "board_id", "text", "x", "y", "width", "height", "z", "color",
    "glass", "font_size", "created_at",
  ]),
  tracks: new Set(["id", "title", "file_path", "src_url", "created_at"]),
  settings: new Set(["key", "value"]),
};

type Row = Record<string, unknown>;
type Manifest = Record<string, Row[]>;

/**
 * Reject a malformed or foreign bundle BEFORE anything destructive runs. Every
 * table must be one we own and every row's columns a subset of that table's
 * schema. (The sql plugin pools connections, so a single atomic transaction
 * across the wipe+insert isn't available here — validating up front is what
 * keeps a bad import from destroying the current board.)
 */
export function validateManifest(m: Manifest): void {
  for (const [table, rows] of Object.entries(m)) {
    const allowed = TABLE_COLUMNS[table];
    if (!allowed) throw new Error(`unknown table in bundle: ${table}`);
    if (!Array.isArray(rows)) throw new Error(`malformed rows for table: ${table}`);
    for (const row of rows) {
      if (!row || typeof row !== "object") {
        throw new Error(`malformed row in ${table}`);
      }
      for (const col of Object.keys(row)) {
        if (!allowed.has(col)) {
          throw new Error(`unknown column "${col}" in ${table}`);
        }
      }
    }
  }
}

async function dumpManifest(): Promise<Manifest> {
  const db = await getDb();
  const m: Manifest = {};
  for (const t of INSERT_ORDER) {
    m[t] = await db.select<Row[]>(`SELECT * FROM ${t}`);
  }
  return m;
}

function assetPaths(m: Manifest): string[] {
  const paths: string[] = [];
  for (const it of m.items ?? []) {
    if (typeof it.file_path === "string") paths.push(it.file_path);
  }
  for (const tr of m.tracks ?? []) {
    if (typeof tr.file_path === "string") paths.push(tr.file_path);
  }
  for (const b of m.boards ?? []) {
    if (typeof b.bg_path === "string") paths.push(b.bg_path);
  }
  return [...new Set(paths)];
}

/** Export the whole board to a user-chosen .json file. Returns false if cancelled. */
export async function exportBundle(): Promise<boolean> {
  const manifest = await dumpManifest();
  const outPath = await save({
    defaultPath: "inspo-board-export.json",
    filters: [{ name: "Inspo Board", extensions: ["json"] }],
  });
  if (!outPath) return false;
  await invoke("export_data", {
    outPath,
    manifest: JSON.stringify(manifest),
    assetPaths: assetPaths(manifest),
  });
  return true;
}

async function insertRow(table: string, row: Row): Promise<void> {
  const db = await getDb();
  const cols = Object.keys(row);
  if (cols.length === 0) return;
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  await db.execute(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`,
    cols.map((c) => row[c]),
  );
}

async function applyManifest(m: Manifest): Promise<void> {
  // Validate the whole manifest first: a bad bundle must fail before the wipe,
  // not halfway through restoring it.
  validateManifest(m);
  const db = await getDb();
  for (const t of WIPE_ORDER) await db.execute(`DELETE FROM ${t}`);
  for (const t of INSERT_ORDER) {
    for (const row of m[t] ?? []) await insertRow(t, row);
  }
}

/**
 * Import a bundle, REPLACING the current board. Rust restores the asset files
 * and returns the manifest; we apply it to the DB then reload so all stores
 * re-init from the imported data. Returns false if cancelled.
 */
export async function importBundle(): Promise<boolean> {
  const inPath = await open({
    multiple: false,
    filters: [{ name: "Inspo Board", extensions: ["json"] }],
  });
  if (!inPath || Array.isArray(inPath)) return false;
  const manifestJson = await invoke<string>("import_data", { inPath });
  const manifest = JSON.parse(manifestJson) as Manifest;
  await applyManifest(manifest);
  // Simplest reliable way to re-init every store from fresh DB state.
  window.location.reload();
  return true;
}
