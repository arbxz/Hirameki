import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { v4 as uuid } from "uuid";
import { getDb } from "./db";
import { listWorkspaces, uniqueWorkspaceName } from "./workspaces";

// Export/import. A bundle is a single JSON file containing DB rows plus the
// actual image & audio bytes (base64, embedded by the Rust side) so it's
// portable across machines.
//
// Two scopes:
//   "workspace" — one workspace and its boards. Importing one ADDS a workspace;
//                 nothing already on the device is touched.
//   "all"       — every workspace. Importing one REPLACES the device.
//
// Tracks and audio are legacy (the music widget is gone) but still round-trip
// in an "all" bundle, because that import wipes every table first: dropping
// them here would delete them from the target machine. A workspace bundle
// leaves them alone — they were never workspace-scoped.
//
// JS owns DB read/write (via the sql plugin); Rust owns reading/writing the
// asset files and the bundle file itself (unrestricted std::fs).

/** Bumped when the bundle's shape changes. 1 = pre-workspaces (no version field). */
export const BUNDLE_VERSION = 2;

export type BundleScope = "workspace" | "all";

// FK-safe insertion order (parents before children).
const INSERT_ORDER = [
  "workspaces", "boards", "groups", "items", "notes", "tracks", "settings",
];
// Wipe order (children before parents). `settings` references workspaces, so it
// goes before them.
const WIPE_ORDER = [
  "items", "notes", "groups", "tracks", "settings", "boards", "workspaces",
];

// Allowed columns per table (matches the migrations). Used to validate an
// imported manifest before applying it: this both rejects foreign/corrupt
// bundles and keeps the dynamically-built INSERTs free of attacker-controlled
// identifiers (column/table names can't be parameterized).
const TABLE_COLUMNS: Record<string, ReadonlySet<string>> = {
  workspaces: new Set(["id", "name", "created_at", "updated_at", "position"]),
  boards: new Set([
    "id", "workspace_id", "name", "created_at", "updated_at", "view_x",
    "view_y", "view_zoom", "color", "position", "bg_path", "bg_url", "bg_fit",
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
  settings: new Set(["workspace_id", "key", "value"]),
};

type Row = Record<string, unknown>;
export type Manifest = Record<string, Row[]>;

/** What Rust hands back after restoring the asset files. */
interface Envelope {
  version?: number;
  scope?: BundleScope;
  manifest: string;
}

/**
 * Reject a malformed or foreign bundle BEFORE anything destructive runs. Every
 * table must be one we own and every row's columns a subset of that table's
 * schema. (The sql plugin pools connections, so a single atomic transaction
 * across the wipe+insert isn't available here — validating up front is what
 * keeps a bad import from destroying the current boards.)
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

/**
 * Which scope a bundle is, tolerating files written before scopes existed.
 *
 * A pre-workspaces bundle has no version and no `workspaces` table. It can't be
 * a device restore any more — its boards have no workspace to belong to — so it
 * is treated as a workspace bundle and lands as a new workspace. That is also
 * the kinder reading: an old backup should not wipe a machine that has since
 * grown several workspaces.
 */
export function scopeOf(env: Envelope): BundleScope {
  if (env.scope === "workspace" || env.scope === "all") return env.scope;
  return "workspace";
}

/** True for a bundle written before workspaces existed. */
export function isLegacyBundle(env: Envelope, m: Manifest): boolean {
  return (env.version ?? 1) < 2 || !m.workspaces;
}

/**
 * Give every row in a workspace bundle a fresh id, rewiring the foreign keys to
 * match, so it can be inserted alongside what's already here.
 *
 * Required, not merely tidy: bundles written before this change contain a board
 * with the literal id "default", and re-importing a workspace onto the machine
 * it came from would collide on every primary key.
 *
 * Asset paths are deliberately untouched. Assets are keyed by path in the
 * bundle and restored to the same relative path, so two workspaces referencing
 * the same picture share one file on disk.
 */
export function remapIds(m: Manifest): Manifest {
  const maps: Record<string, Map<string, string>> = {
    workspaces: new Map(),
    boards: new Map(),
    groups: new Map(),
    items: new Map(),
    notes: new Map(),
  };
  // Pass one: mint a new id for every row that has one.
  for (const table of Object.keys(maps)) {
    for (const row of m[table] ?? []) {
      if (typeof row.id === "string") maps[table].set(row.id, uuid());
    }
  }
  const to = (table: string, id: unknown): unknown =>
    typeof id === "string" ? (maps[table].get(id) ?? id) : id;

  // Pass two: rewrite ids and the keys pointing at them.
  const out: Manifest = {};
  for (const [table, rows] of Object.entries(m)) {
    out[table] = rows.map((row) => {
      const next: Row = { ...row };
      if (maps[table] && typeof next.id === "string") {
        next.id = maps[table].get(next.id) ?? next.id;
      }
      if (table === "boards") next.workspace_id = to("workspaces", next.workspace_id);
      if (table === "groups") next.board_id = to("boards", next.board_id);
      if (table === "items") {
        next.board_id = to("boards", next.board_id);
        next.group_id = to("groups", next.group_id);
      }
      if (table === "notes") next.board_id = to("boards", next.board_id);
      if (table === "settings") {
        next.workspace_id = to("workspaces", next.workspace_id);
        // This one holds a board id as its *value*; left alone, the imported
        // workspace would try to reopen a board that is no longer its own.
        if (next.key === "board.activeId") next.value = to("boards", next.value);
      }
      return next;
    });
  }
  return out;
}

async function dumpAll(): Promise<Manifest> {
  const db = await getDb();
  const m: Manifest = {};
  for (const t of INSERT_ORDER) m[t] = await db.select<Row[]>(`SELECT * FROM ${t}`);
  return m;
}

async function dumpWorkspace(workspaceId: string): Promise<Manifest> {
  const db = await getDb();
  const sel = (sql: string) => db.select<Row[]>(sql, [workspaceId]);
  // Groups, items and notes reach their workspace through boards.
  const viaBoards = (table: string) =>
    sel(
      `SELECT ${table}.* FROM ${table}
       JOIN boards ON boards.id = ${table}.board_id
       WHERE boards.workspace_id = $1`,
    );
  return {
    workspaces: await sel("SELECT * FROM workspaces WHERE id = $1"),
    boards: await sel("SELECT * FROM boards WHERE workspace_id = $1"),
    groups: await viaBoards("groups"),
    items: await viaBoards("items"),
    notes: await viaBoards("notes"),
    // Tracks are global legacy rows, not this workspace's, so they stay put.
    tracks: [],
    settings: await sel("SELECT * FROM settings WHERE workspace_id = $1"),
  };
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

/** Lowercase, hyphenated, punctuation dropped — safe in a filename. */
function slug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "workspace";
}

/**
 * Default name offered when exporting. Dated, so a second backup doesn't
 * silently overwrite the first, and sorted sensibly in a folder listing. A
 * workspace export is named after it, so a folder of them is readable.
 */
export function exportFileName(
  scope: BundleScope = "all",
  workspaceName?: string,
  now: Date = new Date(),
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  // Local date, not ISO/UTC: the name should match the day the user is having.
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const what =
    scope === "workspace" && workspaceName ? slug(workspaceName) : "boards";
  return `hirameki-${what}-${stamp}.json`;
}

/**
 * Write a bundle to a user-chosen .json file. Returns false if cancelled.
 * `workspace` is required for workspace scope and ignored for "all".
 */
export async function exportBundle(
  scope: BundleScope,
  workspace?: { id: string; name: string },
): Promise<boolean> {
  if (scope === "workspace" && !workspace) {
    throw new Error("a workspace export needs a workspace");
  }
  const manifest =
    scope === "workspace" ? await dumpWorkspace(workspace!.id) : await dumpAll();
  const outPath = await save({
    defaultPath: exportFileName(scope, workspace?.name),
    filters: [{ name: "Hirameki bundle", extensions: ["json"] }],
  });
  if (!outPath) return false;
  await invoke("export_data", {
    outPath,
    version: BUNDLE_VERSION,
    scope,
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

async function insertAll(m: Manifest): Promise<void> {
  for (const t of INSERT_ORDER) {
    for (const row of m[t] ?? []) await insertRow(t, row);
  }
}

/** Device-wide replace. Everything already here is destroyed. */
async function applyAll(m: Manifest): Promise<void> {
  // Validate the whole manifest first: a bad bundle must fail before the wipe,
  // not halfway through restoring it.
  validateManifest(m);
  const db = await getDb();
  for (const t of WIPE_ORDER) await db.execute(`DELETE FROM ${t}`);
  await insertAll(m);
}

/**
 * Additive: the bundle lands as a brand-new workspace and nothing already on
 * the device is touched. Returns the new workspace's id.
 */
async function applyWorkspace(m: Manifest, legacy: boolean): Promise<string> {
  validateManifest(m);
  const existing = await listWorkspaces();
  const remapped = remapIds(m);

  // A pre-workspaces bundle has no workspace row to carry its name, so invent
  // one around its boards.
  if (legacy || !remapped.workspaces?.length) {
    const now = Date.now();
    const id = uuid();
    remapped.workspaces = [
      {
        id,
        name: uniqueWorkspaceName("Imported", existing.map((w) => w.name)),
        created_at: now,
        updated_at: now,
        position: existing.length,
      },
    ];
    for (const b of remapped.boards ?? []) b.workspace_id = id;
    // Old bundles carry global settings rows (theme, active board) that would
    // now be ambiguous; the imported workspace starts on the app defaults.
    remapped.settings = [];
  } else {
    const ws = remapped.workspaces[0];
    ws.name = uniqueWorkspaceName(
      typeof ws.name === "string" ? ws.name : "Imported",
      existing.map((w) => w.name),
    );
    ws.position = existing.length;
  }

  // Tracks are global legacy rows; an additive import must not duplicate them.
  remapped.tracks = [];
  await insertAll(remapped);
  return String(remapped.workspaces[0].id);
}

export interface ImportResult {
  scope: BundleScope;
  /** Set for a workspace import: the workspace that was created. */
  workspaceId?: string;
}

/**
 * Read a bundle the user picks and tell the caller what kind it is, without
 * applying it — so a device-wide replace can be confirmed before it happens.
 * Rust has already restored the asset files by this point, which is harmless:
 * they are content-addressed by path and orphans are ignored.
 */
export async function readBundle(): Promise<
  { env: Envelope; manifest: Manifest; scope: BundleScope; legacy: boolean } | null
> {
  const inPath = await open({
    multiple: false,
    filters: [{ name: "Hirameki bundle", extensions: ["json"] }],
  });
  if (!inPath || Array.isArray(inPath)) return null;
  const raw = await invoke<string>("import_data", { inPath });
  const env = JSON.parse(raw) as Envelope;
  const manifest = JSON.parse(env.manifest) as Manifest;
  return {
    env,
    manifest,
    scope: scopeOf(env),
    legacy: isLegacyBundle(env, manifest),
  };
}

/** Apply a bundle already read by readBundle. */
export async function applyBundle(read: {
  manifest: Manifest;
  scope: BundleScope;
  legacy: boolean;
}): Promise<ImportResult> {
  if (read.scope === "all" && !read.legacy) {
    await applyAll(read.manifest);
    return { scope: "all" };
  }
  const workspaceId = await applyWorkspace(read.manifest, read.legacy);
  return { scope: "workspace", workspaceId };
}
