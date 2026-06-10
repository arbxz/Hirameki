import { create } from "zustand";
import type { Board, Group, Item } from "../types/board";
import {
  createBoard as repoCreateBoard,
  createGroup as repoCreateGroup,
  createItem as repoCreateItem,
  deleteBoard as repoDeleteBoard,
  deleteGroup as repoDeleteGroup,
  deleteItem as repoDeleteItem,
  listBoards,
  listGroups,
  listItems,
  loadOrCreateDefaultBoard,
  reorderBoards as repoReorderBoards,
  saveBoardView,
  updateBoardBackground as repoUpdateBoardBackground,
  updateBoardMeta as repoUpdateBoardMeta,
  updateItem as repoUpdateItem,
} from "../lib/repo";
import { getSetting, setSetting } from "../lib/settings";

const ACTIVE_BOARD_KEY = "board.activeId";

// Debounce helper for write-back of high-frequency state (viewport, drags).
// Exposes `flush()` to fire any pending call immediately (used on app close so
// the final viewport position is never lost to the trailing delay).
interface Debounced<A extends unknown[]> {
  (...a: A): void;
  flush: () => void;
}
function debounce<A extends unknown[]>(
  fn: (...a: A) => void,
  ms: number,
): Debounced<A> {
  let t: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;
  const wrapped = (...a: A) => {
    pending = a;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = undefined;
      pending = undefined;
      fn(...a);
    }, ms);
  };
  wrapped.flush = () => {
    if (t) clearTimeout(t);
    t = undefined;
    if (pending) {
      fn(...pending);
      pending = undefined;
    }
  };
  return wrapped;
}

interface BoardState {
  board: Board | null;
  boards: Board[];
  groups: Group[];
  items: Item[];
  loading: boolean;
  error: string | null;

  /** Load all boards and open the last-active one (or the default). */
  init: () => Promise<void>;

  /** Switch to another board, loading its contents. */
  switchBoard: (id: string) => Promise<void>;

  /** Create a new board (title + optional color tag) and switch to it. */
  createBoard: (name: string, color: string | null) => Promise<Board | null>;

  /** Rename / recolor a board's tab. */
  updateBoard: (
    id: string,
    patch: { name?: string; color?: string | null },
  ) => Promise<void>;

  /**
   * Set or clear a board's fixed background. Source is an imported file path
   * OR a remote URL (or null to remove); fit is cover/contain.
   */
  setBoardBackground: (
    boardId: string,
    source: { filePath?: string | null; url?: string | null } | null,
    fit: "cover" | "contain",
  ) => Promise<void>;

  /** Delete a board and all its contents. Refuses to delete the last board. */
  deleteBoard: (id: string) => Promise<void>;

  /** Persist a new left-to-right tab order. */
  reorderBoards: (orderedIds: string[]) => Promise<void>;

  /** Persist the viewport; debounced so panning doesn't hammer the DB. */
  setView: (view: { x: number; y: number; zoom: number }) => void;

  /** Force any pending viewport write to flush now (e.g. on app close). */
  flushView: () => void;

  /** Create an item from geometry (+ optional image fields) and persist it. */
  addItem: (
    partial: Partial<Item> & Pick<Item, "x" | "y" | "width" | "height">,
  ) => Promise<Item | null>;

  /** Patch one item in memory and persist immediately. */
  patchItem: (id: string, patch: ItemGeomPatch) => void;

  /** Patch many items at once (group drag/resize, z-order) and persist each. */
  patchItems: (updates: { id: string; patch: ItemGeomPatch }[]) => void;

  removeItem: (id: string) => Promise<void>;
  removeItems: (ids: string[]) => Promise<void>;

  /** Group the given items into a new group; returns the new group id. */
  groupItems: (ids: string[]) => Promise<string | null>;
  /** Disband the group(s) that the given items belong to. */
  ungroupItems: (ids: string[]) => Promise<void>;
  /** Expand a set of item ids to include all siblings sharing a group. */
  expandSelection: (ids: string[]) => string[];
  /** Delete any group rows that no longer have member items. */
  pruneEmptyGroups: () => Promise<void>;

  /** Raise the given items above all others, preserving their relative order. */
  bringToFront: (ids: string[]) => void;
  /** Lower the given items below all others, preserving their relative order. */
  sendToBack: (ids: string[]) => void;

  setError: (error: string | null) => void;
}

type ItemGeomPatch = Partial<
  Pick<Item, "x" | "y" | "width" | "height" | "rotation" | "z" | "groupId">
>;

// Guards against a second init() (React StrictMode mounts effects twice in dev).
let initStarted = false;

export const useBoardStore = create<BoardState>((set, get) => {
  // Persist the viewport at most every 400ms.
  const persistView = debounce((boardId: string, v: { x: number; y: number; zoom: number }) => {
    void saveBoardView(boardId, v);
  }, 400);

  // Load a board's groups + items into state (shared by init/switch/create).
  const openBoard = async (board: Board) => {
    const [items, groups] = await Promise.all([
      listItems(board.id),
      listGroups(board.id),
    ]);
    set({ board, items, groups, error: null });
    void setSetting(ACTIVE_BOARD_KEY, board.id);
  };

  return {
    board: null,
    boards: [],
    groups: [],
    items: [],
    loading: true,
    error: null,

    async init() {
      if (initStarted) return;
      initStarted = true;
      try {
        // Ensure the default board exists on first run, then load the full set.
        await loadOrCreateDefaultBoard();
        const [boards, activeId] = await Promise.all([
          listBoards(),
          getSetting(ACTIVE_BOARD_KEY),
        ]);
        const active =
          boards.find((b) => b.id === activeId) ?? boards[0];
        set({ boards });
        await openBoard(active);
        set({ loading: false });
      } catch (e) {
        initStarted = false; // allow a retry after a failed load
        set({ loading: false, error: String(e) });
      }
    },

    async switchBoard(id) {
      const { board: current, boards } = get();
      if (current?.id === id) return;
      // Flush any pending viewport write for the board we're leaving.
      persistView.flush();
      const target = boards.find((b) => b.id === id);
      if (!target) return;
      try {
        await openBoard(target);
      } catch (e) {
        set({ error: String(e) });
      }
    },

    async createBoard(name, color) {
      try {
        const board = await repoCreateBoard(name, color);
        persistView.flush();
        set({ boards: [...get().boards, board] });
        await openBoard(board);
        return board;
      } catch (e) {
        set({ error: String(e) });
        return null;
      }
    },

    async updateBoard(id, patch) {
      set({
        boards: get().boards.map((b) =>
          b.id === id ? { ...b, ...patch } : b,
        ),
        board:
          get().board?.id === id
            ? { ...(get().board as Board), ...patch }
            : get().board,
      });
      await repoUpdateBoardMeta(id, patch);
    },

    async deleteBoard(id) {
      const { boards, board } = get();
      if (boards.length <= 1) {
        set({ error: "Can't delete the last board." });
        return;
      }
      const remaining = boards.filter((b) => b.id !== id);
      set({ boards: remaining });
      await repoDeleteBoard(id);
      // If we deleted the active board, open a neighbour.
      if (board?.id === id) {
        await openBoard(remaining[0]);
      }
    },

    async reorderBoards(orderedIds) {
      const byId = new Map(get().boards.map((b) => [b.id, b]));
      const reordered = orderedIds
        .map((bid, i) => {
          const b = byId.get(bid);
          return b ? { ...b, position: i } : null;
        })
        .filter((b): b is Board => b !== null);
      set({ boards: reordered });
      await repoReorderBoards(orderedIds);
    },

    async setBoardBackground(boardId, source, fit) {
      const patch = {
        bgPath: source?.filePath ?? null,
        bgUrl: source?.url ?? null,
        bgFit: fit,
      };
      const active = get().board;
      set({
        board:
          active?.id === boardId ? { ...active, ...patch } : active,
        boards: get().boards.map((b) =>
          b.id === boardId ? { ...b, ...patch } : b,
        ),
      });
      try {
        await repoUpdateBoardBackground(boardId, source, fit);
      } catch (e) {
        set({ error: String(e) });
      }
    },

    setView(view) {
      const board = get().board;
      if (!board) return;
      const next = { ...board, viewX: view.x, viewY: view.y, viewZoom: view.zoom };
      // Keep the boards array in sync too: switchBoard restores a board's
      // viewport from this in-memory list, so it must reflect live pan/zoom —
      // otherwise switching back snaps to the last-loaded (stale) position.
      set({
        board: next,
        boards: get().boards.map((b) => (b.id === board.id ? next : b)),
      });
      persistView(board.id, view);
    },

    flushView() {
      persistView.flush();
    },

    async addItem(partial) {
      const board = get().board;
      if (!board) return null;
      try {
        const item = await repoCreateItem(board.id, partial);
        set({ items: [...get().items, item] });
        return item;
      } catch (e) {
        set({ error: String(e) });
        return null;
      }
    },

    patchItem(id, patch) {
      set({
        items: get().items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      });
      void repoUpdateItem(id, patch);
    },

    patchItems(updates) {
      const byId = new Map(updates.map((u) => [u.id, u.patch]));
      set({
        items: get().items.map((it) => {
          const p = byId.get(it.id);
          return p ? { ...it, ...p } : it;
        }),
      });
      for (const u of updates) void repoUpdateItem(u.id, u.patch);
    },

    async removeItem(id) {
      set({ items: get().items.filter((it) => it.id !== id) });
      await repoDeleteItem(id);
    },

    async removeItems(ids) {
      const set_ = new Set(ids);
      set({ items: get().items.filter((it) => !set_.has(it.id)) });
      await Promise.all(ids.map((id) => repoDeleteItem(id)));
      // Drop any group that no longer has members.
      await get().pruneEmptyGroups();
    },

    async groupItems(ids) {
      const board = get().board;
      if (!board || ids.length < 2) return null;
      const members = get().items.filter((it) => ids.includes(it.id));
      // Bounding box over the members (stored on the group row).
      const minX = Math.min(...members.map((m) => m.x));
      const minY = Math.min(...members.map((m) => m.y));
      const maxX = Math.max(...members.map((m) => m.x + m.width));
      const maxY = Math.max(...members.map((m) => m.y + m.height));
      try {
        const group = await repoCreateGroup(board.id, ids, {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        });
        const idSet = new Set(ids);
        set({
          groups: [...get().groups, group],
          items: get().items.map((it) =>
            idSet.has(it.id) ? { ...it, groupId: group.id } : it,
          ),
        });
        return group.id;
      } catch (e) {
        set({ error: String(e) });
        return null;
      }
    },

    async ungroupItems(ids) {
      const items = get().items;
      const groupIds = new Set(
        items
          .filter((it) => ids.includes(it.id) && it.groupId)
          .map((it) => it.groupId as string),
      );
      if (groupIds.size === 0) return;
      set({
        groups: get().groups.filter((g) => !groupIds.has(g.id)),
        items: items.map((it) =>
          it.groupId && groupIds.has(it.groupId)
            ? { ...it, groupId: null }
            : it,
        ),
      });
      await Promise.all([...groupIds].map((gid) => repoDeleteGroup(gid)));
    },

    expandSelection(ids) {
      const items = get().items;
      const groupIds = new Set(
        ids
          .map((id) => items.find((it) => it.id === id)?.groupId)
          .filter((g): g is string => !!g),
      );
      if (groupIds.size === 0) return ids;
      const out = new Set(ids);
      for (const it of items) {
        if (it.groupId && groupIds.has(it.groupId)) out.add(it.id);
      }
      return [...out];
    },

    async pruneEmptyGroups() {
      const items = get().items;
      const live = new Set(
        items.map((it) => it.groupId).filter((g): g is string => !!g),
      );
      const empty = get().groups.filter((g) => !live.has(g.id));
      if (empty.length === 0) return;
      set({ groups: get().groups.filter((g) => live.has(g.id)) });
      await Promise.all(empty.map((g) => repoDeleteGroup(g.id)));
    },

    bringToFront(ids) {
      const items = get().items;
      const maxZ = items.reduce((m, it) => Math.max(m, it.z), 0);
      const idSet = new Set(ids);
      // Preserve relative order of the raised items by their current z.
      const raised = items
        .filter((it) => idSet.has(it.id))
        .sort((a, b) => a.z - b.z);
      const updates = raised.map((it, i) => ({
        id: it.id,
        patch: { z: maxZ + 1 + i },
      }));
      get().patchItems(updates);
    },

    sendToBack(ids) {
      const items = get().items;
      const minZ = items.reduce((m, it) => Math.min(m, it.z), 0);
      const idSet = new Set(ids);
      const lowered = items
        .filter((it) => idSet.has(it.id))
        .sort((a, b) => a.z - b.z);
      const updates = lowered.map((it, i) => ({
        id: it.id,
        patch: { z: minZ - lowered.length + i },
      }));
      get().patchItems(updates);
    },

    setError(error) {
      set({ error });
    },
  };
});
