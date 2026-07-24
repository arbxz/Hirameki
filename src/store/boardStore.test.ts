import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, Item } from "../types/board";

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
  createItem: vi.fn(),
  deleteBoard: vi.fn(async () => {}),
  deleteGroup: vi.fn(async () => {}),
  deleteItem: vi.fn(async () => {}),
  listBoards: vi.fn(async () => []),
  listGroups: vi.fn(async () => []),
  listItems: vi.fn(async () => []),
  loadOrCreateDefaultBoard: vi.fn(),
  reorderBoards: vi.fn(async () => {}),
  saveBoardView: vi.fn(async () => {}),
  updateBoardBackground: vi.fn(async () => {}),
  updateBoardMeta: vi.fn(async () => {}),
  updateItem: vi.fn(async () => {}),
}));
vi.mock("../lib/settings", () => ({
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => {}),
}));

const { useBoardStore } = await import("./boardStore");

const board: Board = {
  id: "b1",
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

beforeEach(() => {
  useBoardStore.setState({
    board,
    boards: [board],
    groups: [],
    items: [item("a", 1), item("b", 2), item("c", 3)],
    error: null,
  });
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
