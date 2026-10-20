import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board } from "../types/board";

// init() runs once per process (a module-level `initStarted` guard against
// StrictMode's double-mount), so each case re-imports the store with fresh
// mocks. Kept apart from boardStore.test.ts, which imports it once at the top.

const repo = {
  loadOrCreateDefaultBoard: vi.fn(),
  listBoards: vi.fn(),
  listItems: vi.fn(async () => []),
  listGroups: vi.fn(async () => []),
  createBoard: vi.fn(),
  deleteBoard: vi.fn(async () => {}),
  deleteGroup: vi.fn(async () => {}),
  deleteItem: vi.fn(async () => {}),
  createGroup: vi.fn(),
  createItem: vi.fn(),
  reorderBoards: vi.fn(async () => {}),
  restoreGroup: vi.fn(async () => {}),
  saveBoardView: vi.fn(async () => {}),
  setItemsGroup: vi.fn(async () => {}),
  updateBoardBackground: vi.fn(async () => {}),
  updateBoardMeta: vi.fn(async () => {}),
  updateItem: vi.fn(async () => {}),
};
const settings = {
  getSetting: vi.fn(async () => null as string | null),
  setSetting: vi.fn(async () => {}),
};

vi.mock("../lib/repo", () => repo);
vi.mock("../lib/settings", () => settings);
vi.mock("../lib/notes", () => ({
  listNotes: vi.fn(async () => []),
  createNote: vi.fn(),
  updateNote: vi.fn(async () => {}),
  deleteNote: vi.fn(async () => {}),
}));

const DEFAULT_BOARD: Board = {
  id: "default",
  name: "My Board",
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

async function freshStore() {
  vi.resetModules();
  const { useToastStore } = await import("./toastStore");
  useToastStore.getState().clear();
  const { useBoardStore } = await import("./boardStore");
  return { useBoardStore, useToastStore };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.listItems.mockResolvedValue([]);
  repo.listGroups.mockResolvedValue([]);
  settings.getSetting.mockResolvedValue(null);
});

describe("init on a brand-new install", () => {
  it("opens the default board without raising an error", async () => {
    // What a first launch sees: migrations have just run, loadOrCreateDefaultBoard
    // has inserted "My Board", and no board.activeId has been stored yet.
    repo.loadOrCreateDefaultBoard.mockResolvedValue(DEFAULT_BOARD);
    repo.listBoards.mockResolvedValue([DEFAULT_BOARD]);
    const { useBoardStore, useToastStore } = await freshStore();

    await useBoardStore.getState().init();
    const s = useBoardStore.getState();

    expect(s.board?.id).toBe("default");
    expect(s.boards).toHaveLength(1);
    expect(s.items).toEqual([]);
    expect(s.notes).toEqual([]);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
    // An empty canvas on first run is the expected state, not a failure: the
    // user must not be greeted by "Couldn't open your boards".
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it("still reports when the board list comes back empty", async () => {
    // The inverse of the case above, and the reason the empty canvas can't just
    // be treated as normal: with no boards at all something went wrong, and a
    // silent empty canvas is indistinguishable from losing every board.
    repo.loadOrCreateDefaultBoard.mockResolvedValue(DEFAULT_BOARD);
    repo.listBoards.mockResolvedValue([]);
    const { useBoardStore, useToastStore } = await freshStore();

    await useBoardStore.getState().init();

    expect(useBoardStore.getState().loading).toBe(false);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].kind).toBe("error");
  });
});
