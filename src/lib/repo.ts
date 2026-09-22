import { v4 as uuid } from "uuid";
import type { Board, Group, Item } from "../types/board";
import { getDb } from "./db";

// Data-access layer. Owns the snake_case (DB) <-> camelCase (app) mapping and
// all SQL. Everything above this file works only in app-domain types.

const DEFAULT_BOARD_ID = "default";

// ---------- row mappers ----------

interface BoardRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  view_x: number;
  view_y: number;
  view_zoom: number;
  color: string | null;
  position: number;
  bg_path: string | null;
  bg_url: string | null;
  bg_fit: string;
}

interface GroupRow {
  id: string;
  board_id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string | null;
  z: number;
  created_at: number;
}

interface ItemRow {
  id: string;
  board_id: string;
  group_id: string | null;
  file_path: string | null;
  src_url: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z: number;
  natural_w: number | null;
  natural_h: number | null;
  created_at: number;
}

const toBoard = (r: BoardRow): Board => ({
  id: r.id,
  name: r.name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  viewX: r.view_x,
  viewY: r.view_y,
  viewZoom: r.view_zoom,
  color: r.color,
  position: r.position,
  bgPath: r.bg_path,
  bgUrl: r.bg_url,
  bgFit: r.bg_fit === "contain" ? "contain" : "cover",
});

const toGroup = (r: GroupRow): Group => ({
  id: r.id,
  boardId: r.board_id,
  title: r.title,
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
  color: r.color,
  z: r.z,
  createdAt: r.created_at,
});

const toItem = (r: ItemRow): Item => ({
  id: r.id,
  boardId: r.board_id,
  groupId: r.group_id,
  filePath: r.file_path,
  srcUrl: r.src_url,
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
  rotation: r.rotation,
  z: r.z,
  naturalW: r.natural_w,
  naturalH: r.natural_h,
  createdAt: r.created_at,
});

// ---------- boards ----------

/**
 * Loads the single default board, creating it on first run. The insert is
 * idempotent (ON CONFLICT DO NOTHING) so two concurrent first-run inits — e.g.
 * React StrictMode double-invoking the store — can't collide on the primary key;
 * we then read back whichever row won.
 */
export async function loadOrCreateDefaultBoard(): Promise<Board> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO boards (id, name, created_at, updated_at, view_x, view_y, view_zoom, position)
     VALUES ($1, $2, $3, $3, 0, 0, 1, 0)
     ON CONFLICT(id) DO NOTHING`,
    [DEFAULT_BOARD_ID, "My Board", Date.now()],
  );
  const rows = await db.select<BoardRow[]>(
    "SELECT * FROM boards WHERE id = $1",
    [DEFAULT_BOARD_ID],
  );
  return toBoard(rows[0]);
}

/** All boards in tab order (left to right). */
export async function listBoards(): Promise<Board[]> {
  const db = await getDb();
  const rows = await db.select<BoardRow[]>(
    "SELECT * FROM boards ORDER BY position ASC, created_at ASC",
  );
  return rows.map(toBoard);
}

/** Create a new empty board placed after all existing tabs. */
export async function createBoard(
  name: string,
  color: string | null,
): Promise<Board> {
  const db = await getDb();
  const maxRows = await db.select<{ m: number | null }[]>(
    "SELECT MAX(position) AS m FROM boards",
  );
  const position = (maxRows[0]?.m ?? -1) + 1;
  const now = Date.now();
  const board: Board = {
    id: uuid(),
    name: name.trim() || "Untitled",
    createdAt: now,
    updatedAt: now,
    viewX: 0,
    viewY: 0,
    viewZoom: 1,
    color,
    position,
    bgPath: null,
    bgUrl: null,
    bgFit: "cover",
  };
  await db.execute(
    `INSERT INTO boards
       (id, name, created_at, updated_at, view_x, view_y, view_zoom, color, position)
     VALUES ($1,$2,$3,$3,0,0,1,$4,$5)`,
    [board.id, board.name, now, board.color, board.position],
  );
  return board;
}

/** Rename / recolor a board. */
export async function updateBoardMeta(
  id: string,
  patch: { name?: string; color?: string | null },
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`);
    vals.push(patch.name);
  }
  if (patch.color !== undefined) {
    sets.push(`color = $${i++}`);
    vals.push(patch.color);
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = $${i++}`);
  vals.push(Date.now());
  vals.push(id);
  await db.execute(`UPDATE boards SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

/**
 * Set (or clear) a board's fixed background. Pass source = null to remove it.
 * Exactly one of filePath / url is set when a background is present.
 */
export async function updateBoardBackground(
  id: string,
  source: { filePath?: string | null; url?: string | null } | null,
  fit: "cover" | "contain",
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE boards SET bg_path = $1, bg_url = $2, bg_fit = $3, updated_at = $4
     WHERE id = $5`,
    [
      source?.filePath ?? null,
      source?.url ?? null,
      fit,
      Date.now(),
      id,
    ],
  );
}

/** Delete a board and (via FK cascade) all its groups and items. */
export async function deleteBoard(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM boards WHERE id = $1", [id]);
}

/** Persist a new tab order (array of board ids, left to right). */
export async function reorderBoards(orderedIds: string[]): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute("UPDATE boards SET position = $1 WHERE id = $2", [
      i,
      orderedIds[i],
    ]);
  }
}

/** Persists the board's viewport (debounced by the caller). */
export async function saveBoardView(
  boardId: string,
  view: { x: number; y: number; zoom: number },
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE boards SET view_x = $1, view_y = $2, view_zoom = $3, updated_at = $4
     WHERE id = $5`,
    [view.x, view.y, view.zoom, Date.now(), boardId],
  );
}

// ---------- items ----------

export async function listItems(boardId: string): Promise<Item[]> {
  const db = await getDb();
  const rows = await db.select<ItemRow[]>(
    "SELECT * FROM items WHERE board_id = $1 ORDER BY z ASC, created_at ASC",
    [boardId],
  );
  return rows.map(toItem);
}

/**
 * Creates an item. Caller supplies geometry; everything else defaults. Returns
 * the full Item so the store can insert it without a re-read.
 */
export async function createItem(
  boardId: string,
  partial: Partial<Item> & Pick<Item, "x" | "y" | "width" | "height">,
): Promise<Item> {
  const db = await getDb();
  const item: Item = {
    id: partial.id ?? uuid(),
    boardId,
    groupId: partial.groupId ?? null,
    filePath: partial.filePath ?? null,
    srcUrl: partial.srcUrl ?? null,
    x: partial.x,
    y: partial.y,
    width: partial.width,
    height: partial.height,
    rotation: partial.rotation ?? 0,
    z: partial.z ?? 0,
    naturalW: partial.naturalW ?? null,
    naturalH: partial.naturalH ?? null,
    createdAt: partial.createdAt ?? Date.now(),
  };
  await db.execute(
    `INSERT INTO items
       (id, board_id, group_id, file_path, src_url, x, y, width, height,
        rotation, z, natural_w, natural_h, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      item.id,
      item.boardId,
      item.groupId,
      item.filePath,
      item.srcUrl,
      item.x,
      item.y,
      item.width,
      item.height,
      item.rotation,
      item.z,
      item.naturalW,
      item.naturalH,
      item.createdAt,
    ],
  );
  return item;
}

/** Patches the mutable geometry/grouping fields of an item. */
export async function updateItem(
  id: string,
  patch: Partial<
    Pick<Item, "x" | "y" | "width" | "height" | "rotation" | "z" | "groupId">
  >,
): Promise<void> {
  const cols: Record<string, string> = {
    x: "x",
    y: "y",
    width: "width",
    height: "height",
    rotation: "rotation",
    z: "z",
    groupId: "group_id",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [key, col] of Object.entries(cols)) {
    if (key in patch) {
      sets.push(`${col} = $${i++}`);
      vals.push((patch as Record<string, unknown>)[key]);
    }
  }
  if (sets.length === 0) return;
  vals.push(id);
  const db = await getDb();
  await db.execute(
    `UPDATE items SET ${sets.join(", ")} WHERE id = $${i}`,
    vals,
  );
}

export async function deleteItem(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM items WHERE id = $1", [id]);
}

// ---------- groups ----------

export async function listGroups(boardId: string): Promise<Group[]> {
  const db = await getDb();
  const rows = await db.select<GroupRow[]>(
    "SELECT * FROM groups WHERE board_id = $1 ORDER BY z ASC, created_at ASC",
    [boardId],
  );
  return rows.map(toGroup);
}

/**
 * Create a group from a set of items: inserts a groups row (geometry = the
 * items' bounding box, to satisfy the NOT NULL columns) and stamps each item's
 * group_id. Returns the new Group.
 */
export async function createGroup(
  boardId: string,
  itemIds: string[],
  bbox: { x: number; y: number; width: number; height: number },
): Promise<Group> {
  const db = await getDb();
  const group: Group = {
    id: uuid(),
    boardId,
    title: "",
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
    color: null,
    z: 0,
    createdAt: Date.now(),
  };
  await db.execute(
    `INSERT INTO groups (id, board_id, title, x, y, width, height, color, z, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      group.id,
      group.boardId,
      group.title,
      group.x,
      group.y,
      group.width,
      group.height,
      group.color,
      group.z,
      group.createdAt,
    ],
  );
  await setItemsGroup(itemIds, group.id);
  return group;
}

/** Assign (or clear, with null) the group_id of several items. */
export async function setItemsGroup(
  itemIds: string[],
  groupId: string | null,
): Promise<void> {
  if (itemIds.length === 0) return;
  const db = await getDb();
  const placeholders = itemIds.map((_, i) => `$${i + 2}`).join(", ");
  await db.execute(
    `UPDATE items SET group_id = $1 WHERE id IN (${placeholders})`,
    [groupId, ...itemIds],
  );
}

/**
 * Re-insert a previously deleted group row verbatim, keeping its original id.
 * Used by undo: restoring deleted items whose group_id points at a group that
 * was pruned would otherwise violate the items→groups foreign key, so the group
 * row has to come back before its members do.
 */
export async function restoreGroup(group: Group): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO groups (id, board_id, title, x, y, width, height, color, z, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT(id) DO NOTHING`,
    [
      group.id,
      group.boardId,
      group.title,
      group.x,
      group.y,
      group.width,
      group.height,
      group.color,
      group.z,
      group.createdAt,
    ],
  );
}

/** Disband a group: clear members' group_id, then delete the group row. */
export async function deleteGroup(groupId: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE items SET group_id = NULL WHERE group_id = $1", [
    groupId,
  ]);
  await db.execute("DELETE FROM groups WHERE id = $1", [groupId]);
}
