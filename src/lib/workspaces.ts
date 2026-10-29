import { v4 as uuid } from "uuid";
import { getDb } from "./db";

// Data access for workspaces — the container above boards. A workspace owns its
// boards (which cascade-delete with it) and its own appearance, which lives in
// the `settings` table scoped by workspace_id (see settings.ts).
//
// Mirrors repo.ts: snake_case rows in, camelCase domain types out, uuids minted
// here. Kept separate from repo.ts because repo.ts is board-scoped — everything
// in it now takes a board id or a workspace id, and this is the layer above.

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  position: number;
}

interface WorkspaceRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  position: number;
}

const toWorkspace = (r: WorkspaceRow): Workspace => ({
  id: r.id,
  name: r.name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  position: r.position,
});

/** All workspaces, in switcher order. */
export async function listWorkspaces(): Promise<Workspace[]> {
  const db = await getDb();
  const rows = await db.select<WorkspaceRow[]>(
    "SELECT * FROM workspaces ORDER BY position ASC, created_at ASC",
  );
  return rows.map(toWorkspace);
}

export async function createWorkspace(name: string): Promise<Workspace> {
  const db = await getDb();
  const rows = await db.select<{ m: number | null }[]>(
    "SELECT MAX(position) AS m FROM workspaces",
  );
  const position = (rows[0]?.m ?? -1) + 1;
  const now = Date.now();
  const ws: Workspace = { id: uuid(), name, createdAt: now, updatedAt: now, position };
  await db.execute(
    `INSERT INTO workspaces (id, name, created_at, updated_at, position)
     VALUES ($1, $2, $3, $3, $4)`,
    [ws.id, ws.name, now, position],
  );
  return ws;
}

export async function renameWorkspace(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE workspaces SET name = $2, updated_at = $3 WHERE id = $1",
    [id, name, Date.now()],
  );
}

/**
 * Delete a workspace and, by cascade, every board, item, note and group in it.
 *
 * Refuses to remove the last one: the app has no concept of "no workspace", and
 * recovering from it would mean inventing one on next launch, which is a worse
 * answer than declining. Returns false when it refused.
 */
export async function deleteWorkspace(id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM workspaces",
  );
  if ((rows[0]?.n ?? 0) <= 1) return false;
  await db.execute("DELETE FROM workspaces WHERE id = $1", [id]);
  return true;
}

export async function reorderWorkspaces(orderedIds: string[]): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute("UPDATE workspaces SET position = $2 WHERE id = $1", [
      orderedIds[i],
      i,
    ]);
  }
}

/**
 * Which workspace a launch should open.
 *
 * With "load last opened" on, the one you were last in; with it off, the one
 * marked default. Either target can be gone — deleted on another run, or never
 * set — so both fall back to the first workspace, and only an empty list gives
 * null. Pure, because this is the one piece of launch behaviour worth pinning
 * down in tests rather than discovering on someone's machine.
 */
export function resolveLaunchWorkspace(opts: {
  workspaces: readonly { id: string }[];
  loadLast: boolean;
  lastId: string | null;
  defaultId: string | null;
}): string | null {
  const { workspaces, loadLast, lastId, defaultId } = opts;
  if (workspaces.length === 0) return null;
  const has = (id: string | null) =>
    id !== null && workspaces.some((w) => w.id === id);
  const wanted = loadLast ? lastId : defaultId;
  if (has(wanted)) return wanted;
  return workspaces[0].id;
}

/**
 * A name that doesn't collide with an existing one, for imported workspaces:
 * "Personal" becomes "Personal (2)", then "Personal (3)".
 *
 * Pure, so the import path can be tested without a database.
 */
export function uniqueWorkspaceName(name: string, taken: string[]): string {
  const existing = new Set(taken);
  if (!existing.has(name)) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!existing.has(candidate)) return candidate;
  }
}
