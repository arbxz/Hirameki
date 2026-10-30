import { create } from "zustand";
import {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  renameWorkspace,
  resolveLaunchWorkspace,
  type Workspace,
} from "../lib/workspaces";
import { adoptStrandedBoards } from "../lib/repo";
import { GLOBAL_KEYS, getSetting, setSetting } from "../lib/settings";
import { useBoardStore } from "./boardStore";
import { useThemeStore } from "./themeStore";
import { toast } from "./toastStore";

// The workspace a session is in, the list to switch between, and the launch
// preference. This store sits *above* boards and theme: it resolves which
// workspace to open, then tells those two to load for it. The arrow only points
// one way — neither boardStore nor themeStore imports this file — so there is
// no cycle and they stay independently testable.

// Guards against a second init() (React StrictMode mounts effects twice in dev).
let initStarted = false;

interface WorkspaceState {
  workspaces: Workspace[];
  activeId: string | null;
  /** Launch into the last workspace used, rather than the one marked default. */
  loadLast: boolean;
  defaultId: string | null;
  ready: boolean;

  init: () => Promise<void>;
  switchTo: (id: string) => Promise<void>;
  create: (name: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setLoadLast: (on: boolean) => void;
  setDefault: (id: string) => void;
  /** Re-read the list after an import added one. */
  refresh: () => Promise<void>;
}

/** Load a workspace's boards and appearance, and remember we're in it. */
async function enter(id: string) {
  await Promise.all([
    useThemeStore.getState().loadForWorkspace(id),
    useBoardStore.getState().openWorkspace(id),
  ]);
  void setSetting(GLOBAL_KEYS.activeWorkspace, id);
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeId: null,
  loadLast: true,
  defaultId: null,
  ready: false,

  async init() {
    if (initStarted) return;
    initStarted = true;
    try {
      const [found, lastId, defaultId, loadLastRaw] = await Promise.all([
        listWorkspaces(),
        getSetting(GLOBAL_KEYS.activeWorkspace),
        getSetting(GLOBAL_KEYS.defaultWorkspace),
        getSetting(GLOBAL_KEYS.loadLastWorkspace),
      ]);

      // The app has no concept of "no workspace", and a database can arrive
      // without one — restored from an old backup, or emptied by a version
      // that predates them. Make one rather than opening onto nothing.
      let workspaces = found;
      if (workspaces.length === 0) {
        await createWorkspace("Personal");
        workspaces = await listWorkspaces();
      }

      // Sweep up boards that belong to no workspace, into the first one. See
      // adoptStrandedBoards: they are invisible until something claims them.
      const adopted = await adoptStrandedBoards(workspaces[0].id);
      if (adopted > 0) {
        toast.info(
          `Recovered ${adopted} board${adopted === 1 ? "" : "s"} into ${workspaces[0].name}`,
        );
      }
      // Unset means on: reopening where you left off is the behaviour people
      // already had before workspaces existed.
      const loadLast = loadLastRaw !== "0";
      const activeId = resolveLaunchWorkspace({
        workspaces,
        loadLast,
        lastId,
        defaultId,
      });
      set({ workspaces, loadLast, defaultId, activeId, ready: true });
      if (activeId) await enter(activeId);
    } catch (e) {
      initStarted = false; // allow a retry
      console.error(e);
      toast.error("Couldn't open your workspaces");
      set({ ready: true });
    }
  },

  async switchTo(id) {
    if (get().activeId === id) return;
    set({ activeId: id });
    await enter(id);
  },

  async create(name) {
    const ws = await createWorkspace(name.trim() || "Untitled");
    set({ workspaces: [...get().workspaces, ws], activeId: ws.id });
    await enter(ws.id);
  },

  async rename(id, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await renameWorkspace(id, trimmed);
    set({
      workspaces: get().workspaces.map((w) =>
        w.id === id ? { ...w, name: trimmed } : w,
      ),
    });
  },

  async remove(id) {
    const removed = await deleteWorkspace(id);
    if (!removed) {
      // deleteWorkspace refuses the last one rather than leaving the app with
      // nothing to open.
      toast.error("That's your only workspace — there has to be one");
      return;
    }
    const workspaces = get().workspaces.filter((w) => w.id !== id);
    const patch: Partial<WorkspaceState> = { workspaces };
    if (get().defaultId === id) patch.defaultId = null;
    set(patch);
    if (get().activeId === id && workspaces.length) {
      set({ activeId: workspaces[0].id });
      await enter(workspaces[0].id);
    }
  },

  setLoadLast(on) {
    set({ loadLast: on });
    void setSetting(GLOBAL_KEYS.loadLastWorkspace, on ? "1" : "0");
  },

  setDefault(id) {
    set({ defaultId: id });
    void setSetting(GLOBAL_KEYS.defaultWorkspace, id);
  },

  async refresh() {
    set({ workspaces: await listWorkspaces() });
  },
}));
