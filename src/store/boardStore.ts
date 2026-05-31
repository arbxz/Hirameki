import { create } from "zustand";
import type { Board, Group, Item } from "../types/board";
import {
  createItem as repoCreateItem,
  deleteItem as repoDeleteItem,
  listGroups,
  listItems,
  loadOrCreateDefaultBoard,
  saveBoardView,
  updateItem as repoUpdateItem,
} from "../lib/repo";

// Debounce helper for write-back of high-frequency state (viewport, drags).
function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

interface BoardState {
  board: Board | null;
  groups: Group[];
  items: Item[];
  loading: boolean;
  error: string | null;

  /** Load (or create) the default board and its contents from SQLite. */
  init: () => Promise<void>;

  /** Persist the viewport; debounced so panning doesn't hammer the DB. */
  setView: (view: { x: number; y: number; zoom: number }) => void;

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

  /** Raise the given items above all others, preserving their relative order. */
  bringToFront: (ids: string[]) => void;
  /** Lower the given items below all others, preserving their relative order. */
  sendToBack: (ids: string[]) => void;

  setError: (error: string | null) => void;
}

type ItemGeomPatch = Partial<
  Pick<Item, "x" | "y" | "width" | "height" | "rotation" | "z" | "groupId">
>;

export const useBoardStore = create<BoardState>((set, get) => {
  // Persist the viewport at most every 400ms.
  const persistView = debounce((boardId: string, v: { x: number; y: number; zoom: number }) => {
    void saveBoardView(boardId, v);
  }, 400);

  return {
    board: null,
    groups: [],
    items: [],
    loading: true,
    error: null,

    async init() {
      try {
        const board = await loadOrCreateDefaultBoard();
        const [items, groups] = await Promise.all([
          listItems(board.id),
          listGroups(board.id),
        ]);
        set({ board, items, groups, loading: false, error: null });
      } catch (e) {
        set({ loading: false, error: String(e) });
      }
    },

    setView(view) {
      const board = get().board;
      if (!board) return;
      set({ board: { ...board, viewX: view.x, viewY: view.y, viewZoom: view.zoom } });
      persistView(board.id, view);
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
