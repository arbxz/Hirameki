import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, Item } from "../types/board";
import type { Note } from "../lib/notes";

// The store persists every mutation through the repo (SQLite) + settings layers.
// Mock both so the reducers run in isolation with no DB. Fire-and-forget writes
// (patchItem/patchItems) just need to resolve.
vi.mock("../lib/repo", () => ({
  createBoard: vi.fn(),
  createGroup: vi.fn(async (boardId: string, _ids: string[], bbox: object) => ({
    id: "grp-1",
    boardId,
    title: "",
    ...bbox,
    color: null,
    z: 0,
    createdAt: 0,
  })),
  createItem: vi.fn(
    async (boardId: string, partial: Record<string, unknown>) => ({
      ...partial,
      boardId,
    }),
  ),
  deleteBoard: vi.fn(async () => {}),
  deleteGroup: vi.fn(async () => {}),
  deleteItem: vi.fn(async () => {}),
  listBoards: vi.fn(async () => []),
  listGroups: vi.fn(async () => []),
  listItems: vi.fn(async () => []),
  loadOrCreateFirstBoard: vi.fn(),
  reorderBoards: vi.fn(async () => {}),
  restoreGroup: vi.fn(async () => {}),
  saveBoardView: vi.fn(async () => {}),
  setItemsGroup: vi.fn(async () => {}),
  updateBoardBackground: vi.fn(async () => {}),
  updateBoardMeta: vi.fn(async () => {}),
  updateItem: vi.fn(async () => {}),
}));
vi.mock("../lib/settings", () => ({
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => {}),
}));
vi.mock("../lib/notes", () => ({
  listNotes: vi.fn(async () => []),
  createNote: vi.fn(
    async (boardId: string, partial: Record<string, unknown>) => ({
      id: "note-1",
      boardId,
      text: "",
      color: null,
      glass: false,
      fontSize: 14,
      createdAt: 0,
      ...partial,
    }),
  ),
  updateNote: vi.fn(async () => {}),
  deleteNote: vi.fn(async () => {}),
}));

const { useBoardStore } = await import("./boardStore");

const board: Board = {
  id: "b1",
  workspaceId: "ws1",
  name: "Test",
  createdAt: 0,
  updatedAt: 0,
  viewX: 0,
  viewY: 0,
  viewZoom: 1,
  color: null,
  position: 0,
  bgPath: null,
  bgUrl: null,
  bgFit: "cover",
};

function item(id: string, z: number, groupId: string | null = null): Item {
  return {
    id,
    boardId: "b1",
    groupId,
    filePath: null,
    srcUrl: null,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    z,
    naturalW: null,
    naturalH: null,
    createdAt: 0,
  };
}

const zById = () =>
  Object.fromEntries(useBoardStore.getState().items.map((i) => [i.id, i.z]));

function note(id: string, z: number): Note {
  return {
    id,
    boardId: "b1",
    text: "",
    x: 0,
    y: 0,
    width: 220,
    height: 200,
    z,
    color: null,
    glass: false,
    fontSize: 14,
    createdAt: 0,
  };
}

beforeEach(() => {
  useBoardStore.setState({
    board,
    boards: [board],
    groups: [],
    items: [item("a", 1), item("b", 2), item("c", 3)],
    notes: [],
    error: null,
  });
  // The history stack lives in the store factory's closure, so setState above
  // doesn't touch it — each test starts from an empty one.
  useBoardStore.getState().clearHistory();
});

describe("z-ordering", () => {
  it("bringToFront raises the selection above every other item", () => {
    useBoardStore.getState().bringToFront(["a"]);
    const z = zById();
    expect(z.a).toBeGreaterThan(z.b);
    expect(z.a).toBeGreaterThan(z.c);
  });

  it("bringToFront preserves the relative order of the raised items", () => {
    useBoardStore.getState().bringToFront(["b", "a"]);
    const z = zById();
    // a was below b, so it must remain below b after both are raised.
    expect(z.a).toBeLessThan(z.b);
    expect(z.a).toBeGreaterThan(z.c);
  });

  it("sendToBack lowers the selection below every other item", () => {
    useBoardStore.getState().sendToBack(["c"]);
    const z = zById();
    expect(z.c).toBeLessThan(z.a);
    expect(z.c).toBeLessThan(z.b);
  });
});

describe("selection expansion", () => {
  it("expands a selection to include grouped siblings", () => {
    useBoardStore.setState({
      items: [item("a", 1, "g1"), item("b", 2, "g1"), item("c", 3)],
    });
    const expanded = useBoardStore.getState().expandSelection(["a"]);
    expect([...expanded].sort()).toEqual(["a", "b"]);
  });

  it("leaves an ungrouped selection unchanged", () => {
    expect(useBoardStore.getState().expandSelection(["a"])).toEqual(["a"]);
  });
});

describe("grouping", () => {
  it("groupItems stamps every member with the new group id", async () => {
    const gid = await useBoardStore.getState().groupItems(["a", "b"]);
    expect(gid).toBe("grp-1");
    const items = useBoardStore.getState().items;
    expect(items.find((i) => i.id === "a")?.groupId).toBe("grp-1");
    expect(items.find((i) => i.id === "b")?.groupId).toBe("grp-1");
    expect(items.find((i) => i.id === "c")?.groupId).toBeNull();
    expect(useBoardStore.getState().groups).toHaveLength(1);
  });

  it("refuses to group fewer than two items", async () => {
    expect(await useBoardStore.getState().groupItems(["a"])).toBeNull();
    expect(useBoardStore.getState().groups).toHaveLength(0);
  });
});

describe("notes", () => {
  it("addNote places a note near the viewport top-left and on top", async () => {
    const created = await useBoardStore.getState().addNote();
    // board view is at origin, zoom 1 → 80px offset in world units.
    expect(created?.x).toBe(80);
    expect(created?.y).toBe(80);
    expect(created?.z).toBe(1); // maxZ (0) + 1
    expect(useBoardStore.getState().notes).toHaveLength(1);
  });

  it("addNote uses exact world coords when given (right-click menu)", async () => {
    const created = await useBoardStore.getState().addNote({ x: 500, y: 250 });
    expect(created?.x).toBe(500);
    expect(created?.y).toBe(250);
  });

  it("bringNoteToFront raises a note above the others", () => {
    useBoardStore.setState({ notes: [note("n1", 1), note("n2", 2), note("n3", 3)] });
    useBoardStore.getState().bringNoteToFront("n1");
    const z = Object.fromEntries(
      useBoardStore.getState().notes.map((n) => [n.id, n.z]),
    );
    expect(z.n1).toBeGreaterThan(z.n2);
    expect(z.n1).toBeGreaterThan(z.n3);
  });

  it("removeNote drops the note from state", async () => {
    useBoardStore.setState({ notes: [note("n1", 1), note("n2", 2)] });
    await useBoardStore.getState().removeNote("n1");
    const ids = useBoardStore.getState().notes.map((n) => n.id);
    expect(ids).toEqual(["n2"]);
  });

  it("setNoteStyle updates the font size in state", () => {
    useBoardStore.setState({ notes: [note("n1", 1)] });
    useBoardStore.getState().setNoteStyle("n1", { fontSize: 24 });
    expect(useBoardStore.getState().notes[0].fontSize).toBe(24);
  });
});

describe("pruneEmptyGroups", () => {
  it("drops group rows that have no member items", async () => {
    useBoardStore.setState({
      items: [item("a", 1)], // no groupId references g-empty
      groups: [
        {
          id: "g-empty",
          boardId: "b1",
          title: "",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          color: null,
          z: 0,
          createdAt: 0,
        },
      ],
    });
    await useBoardStore.getState().pruneEmptyGroups();
    expect(useBoardStore.getState().groups).toHaveLength(0);
  });
});

describe("undo / redo", () => {
  const ids = () =>
    useBoardStore
      .getState()
      .items.map((i) => i.id)
      .sort();

  it("restores deleted items, and redo removes them again", async () => {
    const store = () => useBoardStore.getState();
    await store().removeItems(["a", "b"]);
    expect(ids()).toEqual(["c"]);

    await store().undo();
    expect(ids()).toEqual(["a", "b", "c"]);

    await store().redo();
    expect(ids()).toEqual(["c"]);
  });

  it("restores the prior geometry of a move", async () => {
    const store = () => useBoardStore.getState();
    store().patchItems([{ id: "a", patch: { x: 500, y: 250 } }]);
    const moved = store().items.find((i) => i.id === "a");
    expect(moved?.x).toBe(500);

    await store().undo();
    const back = store().items.find((i) => i.id === "a");
    expect(back?.x).toBe(0);
    expect(back?.y).toBe(0);
    // ...and only the patched fields; width was never part of the entry.
    expect(back?.width).toBe(100);
  });

  it("exposes a label for the action that would be reversed", () => {
    useBoardStore.getState().bringToFront(["a"]);
    expect(useBoardStore.getState().undoLabel).toBe("Bring to front");
    expect(useBoardStore.getState().redoLabel).toBeNull();
  });

  it("folds a burst of same-key patches into one undo entry", async () => {
    const store = () => useBoardStore.getState();
    for (let i = 1; i <= 5; i++) {
      store().patchItems([{ id: "a", patch: { x: i } }], "Nudge image", "nudge:a");
    }
    expect(store().items.find((i) => i.id === "a")?.x).toBe(5);

    await store().undo();
    // One undo goes all the way back to before the first nudge...
    expect(store().items.find((i) => i.id === "a")?.x).toBe(0);
    expect(store().undoLabel).toBeNull();
    // ...and one redo replays to where the burst ended.
    await store().redo();
    expect(store().items.find((i) => i.id === "a")?.x).toBe(5);
  });

  it("starts a new entry once the merge window has passed", async () => {
    vi.useFakeTimers();
    try {
      const store = () => useBoardStore.getState();
      store().patchItems([{ id: "a", patch: { x: 1 } }], "Nudge image", "nudge:a");
      vi.advanceTimersByTime(1500);
      store().patchItems([{ id: "a", patch: { x: 2 } }], "Nudge image", "nudge:a");

      await store().undo();
      expect(store().items.find((i) => i.id === "a")?.x).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never merges patches with different keys", async () => {
    const store = () => useBoardStore.getState();
    store().patchItems([{ id: "a", patch: { x: 1 } }], "Nudge image", "nudge:a");
    store().patchItems([{ id: "b", patch: { x: 1 } }], "Nudge image", "nudge:b");

    await store().undo();
    expect(store().items.find((i) => i.id === "a")?.x).toBe(1);
    expect(store().items.find((i) => i.id === "b")?.x).toBe(0);
  });

  it("does not record a move that changed nothing", () => {
    useBoardStore.getState().patchItems([{ id: "a", patch: { x: 0 } }]);
    expect(useBoardStore.getState().undoLabel).toBeNull();
  });

  it("drops the redo branch once a new action is recorded", async () => {
    const store = () => useBoardStore.getState();
    store().patchItems([{ id: "a", patch: { x: 500 } }]);
    await store().undo();
    expect(store().redoLabel).not.toBeNull();

    store().patchItems([{ id: "b", patch: { x: 10 } }]);
    expect(store().redoLabel).toBeNull();
  });

  it("undoing a specific entry is a no-op once the stack has moved on", async () => {
    const store = () => useBoardStore.getState();
    await store().removeItems(["a"]);
    const deleteEntry = store().undoId as string;

    // Something else happens before the deferred "Undo" is clicked.
    store().patchItems([{ id: "b", patch: { x: 999 } }]);

    await store().undo(deleteEntry);
    // The delete is NOT reversed, and the later move is left alone.
    expect(ids()).toEqual(["b", "c"]);
    expect(store().items.find((i) => i.id === "b")?.x).toBe(999);
  });

  it("re-groups items when an ungroup is undone", async () => {
    const store = () => useBoardStore.getState();
    useBoardStore.setState({
      items: [item("a", 1, "g1"), item("b", 2, "g1"), item("c", 3)],
      groups: [
        {
          id: "g1",
          boardId: "b1",
          title: "",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          color: null,
          z: 0,
          createdAt: 0,
        },
      ],
    });
    store().clearHistory();

    await store().ungroupItems(["a"]);
    expect(store().items.every((i) => i.groupId === null)).toBe(true);
    expect(store().groups).toHaveLength(0);

    await store().undo();
    expect(store().groups).toHaveLength(1);
    expect(store().items.find((i) => i.id === "a")?.groupId).toBe("g1");
    expect(store().items.find((i) => i.id === "b")?.groupId).toBe("g1");
    expect(store().items.find((i) => i.id === "c")?.groupId).toBeNull();
  });

  it("restores a deleted note with the text it had at deletion", async () => {
    const store = () => useBoardStore.getState();
    useBoardStore.setState({ notes: [note("n1", 1)] });
    store().clearHistory();
    store().patchNoteText("n1", "written before deleting");

    await store().removeNote("n1");
    expect(store().notes).toHaveLength(0);

    await store().undo();
    expect(store().notes).toHaveLength(1);
    expect(store().notes[0].text).toBe("written before deleting");
  });
});
