import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getDb } from "./db";

// Full board export/import. A bundle is a single JSON file containing every DB
// row (boards/groups/items/tracks/settings) plus the actual image & audio bytes
// (base64, embedded by the Rust side) so it's portable across machines.
//
// JS owns DB read/write (via the sql plugin); Rust owns reading/writing the
// asset files and the bundle file itself (unrestricted std::fs).

// FK-safe insertion order (parents before children).
const INSERT_ORDER = ["boards", "groups", "items", "tracks", "settings"];
// Wipe order (children before parents).
const WIPE_ORDER = ["items", "groups", "tracks", "settings", "boards"];

type Row = Record<string, unknown>;
type Manifest = Record<string, Row[]>;

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
