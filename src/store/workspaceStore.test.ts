import { beforeEach, describe, expect, it, vi } from "vitest";

// init() is guarded by a module-level initStarted flag, so each case re-imports
// the store. The two stores it drives are mocked: what matters here is which
// workspace a launch resolves to and that the preference persists globally.

const lib = {
  listWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  renameWorkspace: vi.fn(async () => {}),
  deleteWorkspace: vi.fn(async () => true),
  reorderWorkspaces: vi.fn(async () => {}),
  uniqueWorkspaceName: (n: string) => n,
  // The real implementation is pure and tested in workspaces.test.ts; the store
  // must actually use it rather than re-deciding for itself.
  resolveLaunchWorkspace: vi.fn(),
};
const settings = {
  GLOBAL_KEYS: {
    tourSeen: "onboarding.seen",
    activeWorkspace: "workspace.activeId",
    defaultWorkspace: "workspace.defaultId",
    loadLastWorkspace: "workspace.loadLast",
  },
  getSetting:
    vi.fn<(key: string, workspaceId?: string) => Promise<string | null>>(),
  setSetting: vi.fn(async () => {}),
  settingsForWorkspace: vi.fn(async () => []),
};

const openWorkspace = vi.fn(async () => {});
const loadForWorkspace = vi.fn(async () => {});

vi.mock("../lib/workspaces", () => lib);
vi.mock("../lib/settings", () => settings);
vi.mock("./boardStore", () => ({
  useBoardStore: { getState: () => ({ openWorkspace }) },
}));
vi.mock("./themeStore", () => ({
  useThemeStore: { getState: () => ({ loadForWorkspace }) },
}));

const WORKSPACES = [
  { id: "a", name: "Personal", createdAt: 0, updatedAt: 0, position: 0 },
  { id: "b", name: "Work", createdAt: 0, updatedAt: 0, position: 1 },
];

async function freshStore() {
  vi.resetModules();
  const { useToastStore } = await import("./toastStore");
  useToastStore.getState().clear();
  const { useWorkspaceStore } = await import("./workspaceStore");
  return { useWorkspaceStore, useToastStore };
}

/** Make getSetting answer per key, the way the settings table would. */
function withSettings(values: Record<string, string | null>) {
  settings.getSetting.mockImplementation(async (key: string) => values[key] ?? null);
}

beforeEach(() => {
  vi.clearAllMocks();
  lib.listWorkspaces.mockResolvedValue(WORKSPACES);
  lib.resolveLaunchWorkspace.mockReturnValue("a");
  withSettings({});
});

describe("launch", () => {
  it("defaults to loading the last workspace used", async () => {
    // Unset means on: reopening where you left off is what people had before
    // workspaces existed, so an upgrade shouldn't change behaviour.
    const { useWorkspaceStore } = await freshStore();
    await useWorkspaceStore.getState().init();

    expect(useWorkspaceStore.getState().loadLast).toBe(true);
    expect(lib.resolveLaunchWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ loadLast: true }),
    );
  });

  it("reads the toggle, the last id and the default id from global settings", async () => {
    withSettings({
      "workspace.loadLast": "0",
      "workspace.activeId": "b",
      "workspace.defaultId": "a",
    });
    const { useWorkspaceStore } = await freshStore();
    await useWorkspaceStore.getState().init();

    expect(lib.resolveLaunchWorkspace).toHaveBeenCalledWith({
      workspaces: WORKSPACES,
      loadLast: false,
      lastId: "b",
      defaultId: "a",
    });
    // Global, with no workspace argument — these three decide which workspace
    // to open, so they cannot live inside one.
    expect(settings.getSetting).toHaveBeenCalledWith("workspace.loadLast");
    expect(settings.getSetting).toHaveBeenCalledWith("workspace.defaultId");
  });

  it("loads the resolved workspace's boards and appearance, and remembers it", async () => {
    lib.resolveLaunchWorkspace.mockReturnValue("b");
    const { useWorkspaceStore } = await freshStore();
    await useWorkspaceStore.getState().init();

    expect(useWorkspaceStore.getState().activeId).toBe("b");
    expect(openWorkspace).toHaveBeenCalledWith("b");
    expect(loadForWorkspace).toHaveBeenCalledWith("b");
    expect(settings.setSetting).toHaveBeenCalledWith("workspace.activeId", "b");
  });

  it("reports rather than opening nothing when the list can't be read", async () => {
    lib.listWorkspaces.mockRejectedValue(new Error("database is locked"));
    const { useWorkspaceStore, useToastStore } = await freshStore();
    await useWorkspaceStore.getState().init();

    expect(useWorkspaceStore.getState().ready).toBe(true);
    expect(openWorkspace).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts[0]?.kind).toBe("error");
  });
});

describe("switching and preferences", () => {
  it("switching loads the new workspace and records it as last used", async () => {
    const { useWorkspaceStore } = await freshStore();
    await useWorkspaceStore.getState().init();
    openWorkspace.mockClear();

    await useWorkspaceStore.getState().switchTo("b");

    expect(useWorkspaceStore.getState().activeId).toBe("b");
    expect(openWorkspace).toHaveBeenCalledWith("b");
    expect(loadForWorkspace).toHaveBeenCalledWith("b");
  });

  it("switching to the one already open does nothing", async () => {
    const { useWorkspaceStore } = await freshStore();
    await useWorkspaceStore.getState().init();
    openWorkspace.mockClear();

    await useWorkspaceStore.getState().switchTo("a");

    expect(openWorkspace).not.toHaveBeenCalled();
  });

  it("persists the launch preference globally", async () => {
    const { useWorkspaceStore } = await freshStore();
    await useWorkspaceStore.getState().init();

    useWorkspaceStore.getState().setLoadLast(false);

    expect(useWorkspaceStore.getState().loadLast).toBe(false);
    expect(settings.setSetting).toHaveBeenCalledWith("workspace.loadLast", "0");
  });

  it("refuses to delete the only workspace and says so", async () => {
    // deleteWorkspace returns false rather than leaving the app with nothing
    // to open; the store has to surface that instead of silently no-opping.
    lib.deleteWorkspace.mockResolvedValue(false);
    const { useWorkspaceStore, useToastStore } = await freshStore();
    await useWorkspaceStore.getState().init();

    await useWorkspaceStore.getState().remove("a");

    expect(useWorkspaceStore.getState().workspaces).toHaveLength(2);
    expect(useToastStore.getState().toasts[0]?.kind).toBe("error");
  });

  it("moves to another workspace after deleting the open one", async () => {
    lib.deleteWorkspace.mockResolvedValue(true);
    const { useWorkspaceStore } = await freshStore();
    await useWorkspaceStore.getState().init();
    expect(useWorkspaceStore.getState().activeId).toBe("a");

    await useWorkspaceStore.getState().remove("a");

    expect(useWorkspaceStore.getState().activeId).toBe("b");
    expect(openWorkspace).toHaveBeenCalledWith("b");
  });
});
