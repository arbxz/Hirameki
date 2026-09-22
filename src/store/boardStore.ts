import { create } from "zustand";
import { v4 as uuid } from "uuid";
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
  restoreGroup as repoRestoreGroup,
  saveBoardView,
  setItemsGroup as repoSetItemsGroup,
  updateBoardBackground as repoUpdateBoardBackground,
  updateBoardMeta as repoUpdateBoardMeta,
  updateItem as repoUpdateItem,
} from "../lib/repo";
import {
  createNote as repoCreateNote,
  deleteNote as repoDeleteNote,
  listNotes,
  updateNote as repoUpdateNote,
  type Note,
  type NoteColorKey,
} from "../lib/notes";
import { getSetting, setSetting } from "../lib/settings";
import { toast } from "./toastStore";

const ACTIVE_BOARD_KEY = "board.activeId";

/**
 * One reversible user action. Both directions are closures over the data they
 * need (prior geometry, deleted rows), so replaying never has to re-derive
 * anything from current state — which may have moved on.
 */
interface HistoryEntry {
  /** Identifies this exact entry, so a deferred "Undo" affordance (a toast
   *  button clicked seconds later) can verify it's still the top of the stack
   *  instead of silently reversing whatever the user did in the meantime. */
  id: string;
  /** Shown in the undo/redo tooltips, e.g. "Move 3 images". */
  label: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
  /** Entries sharing a key, recorded within MERGE_WINDOW of each other, fold
   *  into one: a burst of arrow-key nudges undoes as a single move. */
  mergeKey?: string;
  /** When this entry was last recorded or merged into (ms). */
  at: number;
}

const MAX_HISTORY = 100;
const MERGE_WINDOW = 1000;

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

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
  notes: Note[];
  loading: boolean;
  error: string | null;

  /** Label of the action Ctrl+Z would reverse, or null if there's nothing. */
  undoLabel: string | null;
  /** Id of that same action, for callers holding a deferred undo affordance. */
  undoId: string | null;
  /** Label of the action Ctrl+Shift+Z would replay, or null. */
  redoLabel: string | null;
  /**
   * Reverse the most recent recorded action. Pass `expectedId` to make it a
   * no-op unless that specific action is still the one on top.
   */
  undo: (expectedId?: string) => Promise<void>;
  /** Replay the most recently undone action. */
  redo: () => Promise<void>;
  /** Drop the entire history (board switch, import, tests). */
  clearHistory: () => void;

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

  /**
   * Patch many items at once (group drag/resize, z-order) and persist each.
   * Recorded as a single undo entry labelled `label`.
   */
  patchItems: (
    updates: { id: string; patch: ItemGeomPatch }[],
    label?: string,
    /** Fold into the previous entry if it has the same key and is recent
     *  (see HistoryEntry.mergeKey). Patches hold absolute values, so the
     *  merged entry keeps the first undo and takes the latest redo. */
    mergeKey?: string,
  ) => void;

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

  // ----- notes -----

  /**
   * Create a note. With no `at`, it's placed near the top-left of the current
   * viewport (using the live board view); `at` supplies exact world coords
   * (e.g. from the right-click menu).
   */
  addNote: (at?: { x: number; y: number }) => Promise<Note | null>;
  /** Update a note's text (in memory now, persisted debounced while typing). */
  patchNoteText: (id: string, text: string) => void;
  /** Commit a note's geometry after a drag/resize (persisted immediately). */
  commitNoteGeom: (
    id: string,
    geom: { x: number; y: number; width: number; height: number },
  ) => void;
  /** Change a note's color, glass flag, and/or font size (persisted immediately). */
  setNoteStyle: (
    id: string,
    patch: { color?: NoteColorKey | null; glass?: boolean; fontSize?: number },
  ) => void;
  removeNote: (id: string) => Promise<void>;
  /** Raise a note above all other notes. */
  bringNoteToFront: (id: string) => void;
  /** Flush any pending debounced note-text writes now (board switch / close). */
  flushNotes: () => void;

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

  // Per-note debounced text writers: typing shouldn't hit the DB on every
  // keystroke. Created lazily per id; flushed on board switch / app close.
  const noteTextWriters = new Map<string, Debounced<[string]>>();
  const noteTextWriter = (id: string): Debounced<[string]> => {
    let w = noteTextWriters.get(id);
    if (!w) {
      w = debounce((text: string) => void repoUpdateNote(id, { text }), 500);
      noteTextWriters.set(id, w);
    }
    return w;
  };
  const flushNoteWriters = () => {
    for (const w of noteTextWriters.values()) w.flush();
  };

  // ----- undo / redo -----
  //
  // A command stack of inverse closures. Mutations call `record(...)` with the
  // data needed to reverse themselves; `applying` suppresses recording while an
  // undo/redo is running, so the mutations an entry invokes don't push entries
  // of their own (which would make undo un-undoable).
  //
  // Deliberately NOT recorded: note text. A textarea has its own native undo
  // stack, and a global one replaying keystrokes would fight it — so Ctrl+Z
  // inside a note edits text, and outside one it reverses canvas actions.
  let undoStack: HistoryEntry[] = [];
  let redoStack: HistoryEntry[] = [];
  let applying = false;

  const syncHistory = () =>
    set({
      undoLabel: undoStack[undoStack.length - 1]?.label ?? null,
      undoId: undoStack[undoStack.length - 1]?.id ?? null,
      redoLabel: redoStack[redoStack.length - 1]?.label ?? null,
    });

  /**
   * Report a failed operation. Surfaces a dismissable toast and keeps the last
   * message on `error` for anything still reading it. Every persistence call
   * routes failures here — the store updates optimistically, so a silent write
   * failure would leave the UI showing state the DB doesn't have.
   */
  const fail = (e: unknown, context?: string) => {
    const message = context ? `${context}: ${String(e)}` : String(e);
    set({ error: message });
    toast.error(message);
  };

  const record = (entry: Omit<HistoryEntry, "id" | "at">) => {
    if (applying) return;
    const now = Date.now();
    const top = undoStack[undoStack.length - 1];
    if (
      entry.mergeKey &&
      top?.mergeKey === entry.mergeKey &&
      now - top.at < MERGE_WINDOW &&
      redoStack.length === 0
    ) {
      // Keep top.undo (the state before the whole burst); take the new redo.
      top.redo = entry.redo;
      top.at = now;
      return;
    }
    undoStack.push({ ...entry, id: uuid(), at: now });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = []; // a fresh action invalidates the redo branch
    syncHistory();
  };

  const dropHistory = () => {
    undoStack = [];
    redoStack = [];
    syncHistory();
  };

  /**
   * Run one direction of a history entry. If it throws, the board may be
   * half-changed and every remaining entry's assumptions are suspect, so the
   * whole stack is dropped rather than left to corrupt later replays.
   */
  const applyHistory = async (
    entry: HistoryEntry,
    direction: "undo" | "redo",
  ): Promise<boolean> => {
    applying = true;
    try {
      await (direction === "undo" ? entry.undo() : entry.redo());
      return true;
    } catch (e) {
      dropHistory();
      toast.error(`Couldn't ${direction} “${entry.label}”: ${String(e)}`);
      return false;
    } finally {
      applying = false;
    }
  };

  // Load a board's groups + items + notes into state (init/switch/create).
  const openBoard = async (board: Board) => {
    const [items, groups, notes] = await Promise.all([
      listItems(board.id),
      listGroups(board.id),
      listNotes(board.id),
    ]);
    set({ board, items, groups, notes, error: null });
    // History entries close over rows belonging to the board that recorded
    // them; replaying one against a different board would resurrect its
    // contents here. Switching boards starts a fresh stack.
    dropHistory();
    void setSetting(ACTIVE_BOARD_KEY, board.id);
  };

  return {
    board: null,
    boards: [],
    groups: [],
    items: [],
    notes: [],
    loading: true,
    error: null,
    undoLabel: null,
    undoId: null,
    redoLabel: null,

    async undo(expectedId) {
      const entry = undoStack[undoStack.length - 1];
      if (!entry) return;
      // A deferred affordance names the entry it was offered for; if the stack
      // has moved on since, doing nothing is safer than reversing the wrong
      // action behind the user's back.
      if (expectedId !== undefined && entry.id !== expectedId) return;
      undoStack.pop();
      if (await applyHistory(entry, "undo")) {
        redoStack.push(entry);
        syncHistory();
      }
    },

    async redo() {
      const entry = redoStack[redoStack.length - 1];
      if (!entry) return;
      redoStack.pop();
      if (await applyHistory(entry, "redo")) {
        undoStack.push(entry);
        syncHistory();
      }
    },

    clearHistory() {
      dropHistory();
    },

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
      // Flush any pending viewport / note-text writes for the board we're leaving.
      persistView.flush();
      flushNoteWriters();
      const target = boards.find((b) => b.id === id);
      if (!target) return;
      try {
        await openBoard(target);
      } catch (e) {
        fail(e, "Couldn't open board");
      }
    },

    async createBoard(name, color) {
      try {
        const board = await repoCreateBoard(name, color);
        persistView.flush();
        flushNoteWriters();
        set({ boards: [...get().boards, board] });
        await openBoard(board);
        return board;
      } catch (e) {
        fail(e, "Couldn't create board");
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
        fail("at least one board must remain", "Can't delete this board");
        return;
      }
      const remaining = boards.filter((b) => b.id !== id);
      set({ boards: remaining });
      try {
        await repoDeleteBoard(id);
        // If we deleted the active board, open a neighbour.
        if (board?.id === id) {
          await openBoard(remaining[0]);
        }
      } catch (e) {
        set({ boards }); // put the tab back; the row is still there
        fail(e, "Couldn't delete board");
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
        fail(e, "Couldn't set background");
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
        // Undo only removes the DB row — the image file stays on disk so redo
        // can re-reference it. (Deleting an item has never removed its file
        // either; orphan cleanup is a separate concern.)
        let snapshot = item;
        record({
          label: "Add image",
          undo: async () => {
            // Re-snapshot first: the image may have been moved or resized since
            // it was added, and redo should restore it as it last looked.
            snapshot = get().items.find((it) => it.id === item.id) ?? snapshot;
            set({ items: get().items.filter((it) => it.id !== item.id) });
            await repoDeleteItem(item.id);
          },
          redo: async () => {
            const restored = await repoCreateItem(board.id, snapshot);
            set({ items: [...get().items, restored] });
          },
        });
        return item;
      } catch (e) {
        fail(e, "Couldn't add image");
        return null;
      }
    },

    patchItem(id, patch) {
      set({
        items: get().items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      });
      void repoUpdateItem(id, patch);
    },

    patchItems(updates, label = "Move", mergeKey) {
      const before = get().items;
      // Capture only the fields this patch touches, so undo restores exactly
      // what changed and nothing else.
      const inverse = updates.flatMap((u) => {
        const it = before.find((i) => i.id === u.id);
        if (!it) return [];
        const patch: ItemGeomPatch = {};
        for (const key of Object.keys(u.patch) as (keyof ItemGeomPatch)[]) {
          (patch as Record<string, unknown>)[key] = it[key];
        }
        return [{ id: u.id, patch }];
      });

      const write = (list: { id: string; patch: ItemGeomPatch }[]) => {
        const byId = new Map(list.map((u) => [u.id, u.patch]));
        set({
          items: get().items.map((it) => {
            const p = byId.get(it.id);
            return p ? { ...it, ...p } : it;
          }),
        });
        for (const u of list) {
          void repoUpdateItem(u.id, u.patch).catch((e) =>
            fail(e, "Couldn't save change"),
          );
        }
      };

      write(updates);
      // A drag that ends where it started still commits; don't record an entry
      // whose undo would visibly do nothing.
      const changed = inverse.some((inv) => {
        const applied = updates.find((u) => u.id === inv.id)?.patch ?? {};
        return (Object.keys(inv.patch) as (keyof ItemGeomPatch)[]).some(
          (k) => inv.patch[k] !== applied[k],
        );
      });
      if (changed) {
        record({
          label,
          undo: () => write(inverse),
          redo: () => write(updates),
          mergeKey,
        });
      }
    },

    async removeItem(id) {
      await get().removeItems([id]);
    },

    async removeItems(ids) {
      const idSet = new Set(ids);
      const removed = get().items.filter((it) => idSet.has(it.id));
      if (removed.length === 0) return;
      const groupsBefore = get().groups;

      const drop = async () => {
        set({ items: get().items.filter((it) => !idSet.has(it.id)) });
        await Promise.all(ids.map((id) => repoDeleteItem(id)));
        // Drop any group that no longer has members.
        await get().pruneEmptyGroups();
      };

      try {
        await drop();
      } catch (e) {
        fail(e, "Couldn't delete");
        return;
      }

      // Deleting every member of a group prunes the group row; restoring the
      // items would then violate the items→groups FK, so the pruned groups have
      // to be put back first.
      const prunedGroups = groupsBefore.filter(
        (g) => !get().groups.some((live) => live.id === g.id),
      );

      record({
        label: `Delete ${plural(removed.length, "image")}`,
        undo: async () => {
          for (const g of prunedGroups) await repoRestoreGroup(g);
          const restored = await Promise.all(
            removed.map((it) => repoCreateItem(it.boardId, it)),
          );
          set({
            groups: [...get().groups, ...prunedGroups],
            items: [...get().items, ...restored],
          });
        },
        redo: drop,
      });
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
        // Members may already belong to another group; undo has to put each one
        // back where it came from, not just clear it.
        const priorGroupIds = new Map(members.map((m) => [m.id, m.groupId]));

        const attach = () =>
          set({
            groups: [...get().groups, group],
            items: get().items.map((it) =>
              idSet.has(it.id) ? { ...it, groupId: group.id } : it,
            ),
          });

        attach();
        record({
          label: `Group ${plural(ids.length, "image")}`,
          undo: async () => {
            set({
              groups: get().groups.filter((g) => g.id !== group.id),
              items: get().items.map((it) =>
                idSet.has(it.id)
                  ? { ...it, groupId: priorGroupIds.get(it.id) ?? null }
                  : it,
              ),
            });
            await repoDeleteGroup(group.id);
            // repoDeleteGroup nulls every member's group_id, so any that were
            // previously in another group need re-stamping.
            for (const [itemId, gid] of priorGroupIds) {
              if (gid) await repoSetItemsGroup([itemId], gid);
            }
          },
          redo: async () => {
            await repoRestoreGroup(group);
            await repoSetItemsGroup(ids, group.id);
            attach();
          },
        });
        return group.id;
      } catch (e) {
        fail(e, "Couldn't group");
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

      // Snapshot the disbanded group rows and who belonged to which, so undo
      // can rebuild them exactly.
      const disbanded = get().groups.filter((g) => groupIds.has(g.id));
      const membersByGroup = new Map<string, string[]>();
      for (const it of items) {
        if (it.groupId && groupIds.has(it.groupId)) {
          const list = membersByGroup.get(it.groupId) ?? [];
          list.push(it.id);
          membersByGroup.set(it.groupId, list);
        }
      }

      const detach = async () => {
        set({
          groups: get().groups.filter((g) => !groupIds.has(g.id)),
          items: get().items.map((it) =>
            it.groupId && groupIds.has(it.groupId)
              ? { ...it, groupId: null }
              : it,
          ),
        });
        await Promise.all([...groupIds].map((gid) => repoDeleteGroup(gid)));
      };

      try {
        await detach();
      } catch (e) {
        fail(e, "Couldn't ungroup");
        return;
      }

      record({
        label: `Ungroup ${plural(disbanded.length, "group")}`,
        undo: async () => {
          for (const g of disbanded) {
            await repoRestoreGroup(g);
            await repoSetItemsGroup(membersByGroup.get(g.id) ?? [], g.id);
          }
          const groupOf = new Map<string, string>();
          for (const [gid, memberIds] of membersByGroup) {
            for (const id of memberIds) groupOf.set(id, gid);
          }
          set({
            groups: [...get().groups, ...disbanded],
            items: get().items.map((it) =>
              groupOf.has(it.id)
                ? { ...it, groupId: groupOf.get(it.id) as string }
                : it,
            ),
          });
        },
        redo: detach,
      });
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
      get().patchItems(updates, "Bring to front");
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
      get().patchItems(updates, "Send to back");
    },

    // ----- notes -----

    async addNote(at) {
      const board = get().board;
      if (!board) return null;
      const notes = get().notes;
      const maxZ = notes.reduce((m, n) => Math.max(m, n.z), 0);
      // Default placement: near the top-left of the current viewport, cascaded
      // so successive notes don't stack exactly. `at` overrides with world coords.
      const cascade = (notes.length % 6) * 24;
      const x = at ? at.x : board.viewX + (80 + cascade) / board.viewZoom;
      const y = at ? at.y : board.viewY + (80 + cascade) / board.viewZoom;
      try {
        const note = await repoCreateNote(board.id, {
          x,
          y,
          width: 220,
          height: 200,
          z: maxZ + 1,
        });
        set({ notes: [...get().notes, note] });
        // Re-snapshot on undo rather than closing over the note as created: by
        // then it may have been typed into, moved or restyled, and redo should
        // bring back what was actually on screen.
        let snapshot = note;
        record({
          label: "Add note",
          undo: async () => {
            snapshot = get().notes.find((n) => n.id === note.id) ?? snapshot;
            set({ notes: get().notes.filter((n) => n.id !== note.id) });
            await repoDeleteNote(note.id);
          },
          redo: async () => {
            const restored = await repoCreateNote(board.id, snapshot);
            set({ notes: [...get().notes, restored] });
          },
        });
        return note;
      } catch (e) {
        fail(e, "Couldn't add note");
        return null;
      }
    },

    patchNoteText(id, text) {
      set({
        notes: get().notes.map((n) => (n.id === id ? { ...n, text } : n)),
      });
      noteTextWriter(id)(text);
    },

    commitNoteGeom(id, geom) {
      const before = get().notes.find((n) => n.id === id);
      if (!before) return;
      const prior = {
        x: before.x,
        y: before.y,
        width: before.width,
        height: before.height,
      };
      const write = (g: typeof prior) => {
        set({
          notes: get().notes.map((n) => (n.id === id ? { ...n, ...g } : n)),
        });
        void repoUpdateNote(id, g).catch((e) =>
          fail(e, "Couldn't save note position"),
        );
      };
      write(geom);
      // A click on the header starts and ends a gesture without moving the
      // note; don't put a do-nothing entry on the stack for it.
      const moved = (Object.keys(prior) as (keyof typeof prior)[]).some(
        (k) => prior[k] !== geom[k],
      );
      if (moved) {
        record({
          label: "Move note",
          undo: () => write(prior),
          redo: () => write(geom),
        });
      }
    },

    setNoteStyle(id, patch) {
      const before = get().notes.find((n) => n.id === id);
      if (!before) return;
      const prior: typeof patch = {};
      for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
        (prior as Record<string, unknown>)[key] = before[key];
      }
      const write = (p: typeof patch) => {
        set({
          notes: get().notes.map((n) => (n.id === id ? { ...n, ...p } : n)),
        });
        void repoUpdateNote(id, p).catch((e) =>
          fail(e, "Couldn't save note style"),
        );
      };
      write(patch);
      record({
        label: "Restyle note",
        undo: () => write(prior),
        redo: () => write(patch),
      });
    },

    async removeNote(id) {
      // `removed` is the live in-memory note, so it already carries the latest
      // keystrokes even if the debounced write hasn't fired — undo restores
      // them. The pending writer is dropped rather than flushed: it would only
      // race an UPDATE against the DELETE below.
      const removed = get().notes.find((n) => n.id === id);
      if (!removed) return;
      noteTextWriters.delete(id);

      const drop = async () => {
        set({ notes: get().notes.filter((n) => n.id !== id) });
        await repoDeleteNote(id);
      };

      try {
        await drop();
      } catch (e) {
        fail(e, "Couldn't delete note");
        return;
      }

      const board = get().board;
      record({
        label: "Delete note",
        undo: async () => {
          if (!board) return;
          const restored = await repoCreateNote(board.id, removed);
          set({ notes: [...get().notes, restored] });
        },
        redo: drop,
      });
    },

    bringNoteToFront(id) {
      const notes = get().notes;
      const maxZ = notes.reduce((m, n) => Math.max(m, n.z), 0);
      const note = notes.find((n) => n.id === id);
      if (!note || note.z === maxZ) return; // already on top
      const z = maxZ + 1;
      set({
        notes: notes.map((n) => (n.id === id ? { ...n, z } : n)),
      });
      void repoUpdateNote(id, { z });
    },

    flushNotes() {
      flushNoteWriters();
    },

    setError(error) {
      set({ error });
      if (error) toast.error(error);
    },
  };
});
