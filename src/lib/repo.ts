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

/** Loads the single default board, creating it on first run. */
export async function loadOrCreateDefaultBoard(): Promise<Board> {
  const db = await getDb();
  const rows = await db.select<BoardRow[]>(
    "SELECT * FROM boards WHERE id = $1",
    [DEFAULT_BOARD_ID],
  );
  if (rows.length > 0) return toBoard(rows[0]);

  const now = Date.now();
  await db.execute(
    `INSERT INTO boards (id, name, created_at, updated_at, view_x, view_y, view_zoom)
     VALUES ($1, $2, $3, $3, 0, 0, 1)`,
    [DEFAULT_BOARD_ID, "My Board", now],
  );
  return {
    id: DEFAULT_BOARD_ID,
    name: "My Board",
    createdAt: now,
    updatedAt: now,
    viewX: 0,
    viewY: 0,
    viewZoom: 1,
  };
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
