import { getDb } from "./db";

// Thin key/value accessor over the `settings` table. Values are stored as TEXT;
// callers serialize/parse.
//
// Settings are scoped: a row either belongs to a workspace (appearance, the
// last-open board) or is global (`workspace_id IS NULL`) — the onboarding flag
// and the workspace preferences themselves. Omitting `workspaceId` means
// global, so every existing global caller reads the same way it always did.

/** Global keys — deliberately listed, because getting the scope wrong is silent. */
export const GLOBAL_KEYS = {
  tourSeen: "onboarding.seen",
  activeWorkspace: "workspace.activeId",
  defaultWorkspace: "workspace.defaultId",
  loadLastWorkspace: "workspace.loadLast",
} as const;

export async function getSetting(
  key: string,
  workspaceId?: string,
): Promise<string | null> {
  const db = await getDb();
  const rows = workspaceId
    ? await db.select<{ value: string }[]>(
        "SELECT value FROM settings WHERE workspace_id = $1 AND key = $2",
        [workspaceId, key],
      )
    : await db.select<{ value: string }[]>(
        "SELECT value FROM settings WHERE workspace_id IS NULL AND key = $1",
        [key],
      );
  return rows.length ? rows[0].value : null;
}

export async function setSetting(
  key: string,
  value: string,
  workspaceId?: string,
): Promise<void> {
  const db = await getDb();
  // Update-then-insert rather than ON CONFLICT: the uniqueness that makes this
  // an upsert comes from an expression index (ifnull(workspace_id, ''), key),
  // and naming an expression as a conflict target is both fiddly and easy to
  // get subtly wrong. Single-user desktop app, so the gap doesn't matter.
  const res = workspaceId
    ? await db.execute(
        "UPDATE settings SET value = $3 WHERE workspace_id = $1 AND key = $2",
        [workspaceId, key, value],
      )
    : await db.execute(
        "UPDATE settings SET value = $2 WHERE workspace_id IS NULL AND key = $1",
        [key, value],
      );
  if (res.rowsAffected > 0) return;
  await db.execute(
    "INSERT INTO settings (workspace_id, key, value) VALUES ($1, $2, $3)",
    [workspaceId ?? null, key, value],
  );
}

/**
 * Every setting belonging to one workspace, as raw rows — what an export of
 * that workspace has to carry so its appearance travels with its boards.
 */
export async function settingsForWorkspace(
  workspaceId: string,
): Promise<{ workspace_id: string; key: string; value: string }[]> {
  const db = await getDb();
  return db.select<{ workspace_id: string; key: string; value: string }[]>(
    "SELECT workspace_id, key, value FROM settings WHERE workspace_id = $1",
    [workspaceId],
  );
}
