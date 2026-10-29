import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board } from "../types/board";

// openWorkspace() is what a launch and every workspace switch run through, so
// each case re-imports the store with fresh mocks. Kept apart from
// boardStore.test.ts, which imports it once at the top.

const repo = {
  loadOrCreateFirstBoard: vi.fn(),
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
  GLOBAL_KEYS: {
    tourSeen: "onboarding.seen",
    activeWorkspace: "workspace.activeId",
    defaultWorkspace: "workspace.defaultId",
    loadLastWorkspace: "workspace.loadLast",
  },
  getSetting: vi.fn(async () => null as string | null),
  setSetting: vi.fn(async () => {}),
  settingsForWorkspace: vi.fn(async () => []),
};

vi.mock("../lib/repo", () => repo);
vi.mock("../lib/settings", () => settings);
vi.mock("../lib/notes", () => ({
  listNotes: vi.fn(async () => []),
  createNote: vi.fn(),
  updateNote: vi.fn(async () => {}),
  deleteNote: vi.fn(async () => {}),
}));

function board(id: string, workspaceId: string, name = "Board"): Board {
  return {
    id,
    workspaceId,
    name,
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
}

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

describe("openWorkspace on a brand-new install", () => {
  it("opens the workspace's first board without raising an error", async () => {
    // What a first launch sees: migrations have run, the workspace exists with
    // no boards yet, and no board.activeId has been stored for it.
    const b = board("b1", "ws1", "My Board");
    repo.loadOrCreateFirstBoard.mockResolvedValue(b);
    repo.listBoards.mockResolvedValue([b]);
    const { useBoardStore, useToastStore } = await freshStore();

    await useBoardStore.getState().openWorkspace("ws1");
    const s = useBoardStore.getState();

    expect(s.workspaceId).toBe("ws1");
    expect(s.board?.id).toBe("b1");
    expect(s.boards).toHaveLength(1);
    expect(s.items).toEqual([]);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
    // An empty canvas on first run is the expected state, not a failure: the
    // user must not be greeted by "Couldn't open your boards".
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it("asks only for that workspace's boards and its own active-board key", async () => {
    const b = board("b1", "ws2");
    repo.loadOrCreateFirstBoard.mockResolvedValue(b);
    repo.listBoards.mockResolvedValue([b]);
    const { useBoardStore } = await freshStore();

    await useBoardStore.getState().openWorkspace("ws2");

    expect(repo.listBoards).toHaveBeenCalledWith("ws2");
    // Scoped, or every workspace would reopen on whichever board was touched
    // last anywhere on the machine.
    expect(settings.getSetting).toHaveBeenCalledWith("board.activeId", "ws2");
  });

  it("still reports when the board list comes back empty", async () => {
    // The inverse of the first case, and the reason an empty canvas can't just
    // be treated as normal: with no boards at all something went wrong, and a
    // silent empty canvas is indistinguishable from losing every board.
    repo.loadOrCreateFirstBoard.mockResolvedValue(board("b1", "ws1"));
    repo.listBoards.mockResolvedValue([]);
    const { useBoardStore, useToastStore } = await freshStore();

    await useBoardStore.getState().openWorkspace("ws1");

    expect(useBoardStore.getState().loading).toBe(false);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].kind).toBe("error");
  });
});

describe("switching workspaces", () => {
  it("drops undo history, so an entry can't be replayed into the wrong one", async () => {
    // History entries close over rows belonging to the workspace that recorded
    // them. Replaying one after a switch would resurrect that workspace's
    // contents inside this one.
    const a = board("b1", "ws1");
    const b = board("b2", "ws2");
    repo.loadOrCreateFirstBoard.mockResolvedValue(a);
    repo.listBoards.mockResolvedValue([a]);
    const { useBoardStore } = await freshStore();
    await useBoardStore.getState().openWorkspace("ws1");

    // Record something undoable in the first workspace.
    useBoardStore.setState({ items: [] });
    await useBoardStore.getState().addNote({ x: 0, y: 0 });
    expect(useBoardStore.getState().undoId).not.toBeNull();

    repo.loadOrCreateFirstBoard.mockResolvedValue(b);
    repo.listBoards.mockResolvedValue([b]);
    await useBoardStore.getState().openWorkspace("ws2");

    expect(useBoardStore.getState().workspaceId).toBe("ws2");
    expect(useBoardStore.getState().undoId).toBeNull();
    expect(useBoardStore.getState().undoLabel).toBeNull();
  });
});
