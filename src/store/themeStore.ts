import { create } from "zustand";
import {
  cssVar,
  DEFAULT_THEME_NAME,
  PRESETS,
  THEME_TOKENS,
  type Theme,
} from "../lib/themes";
import { getSetting, setSetting } from "../lib/settings";

// Applies a theme by writing its tokens as CSS variables on <html>. The current
// preset name and any custom overrides persist in the settings table, scoped to
// the active workspace — appearance travels with a workspace, so switching one
// restyles the app. workspaceStore calls loadForWorkspace; nothing here reaches
// back up to it.

const SK = { name: "theme.name", custom: "theme.custom" } as const;

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const token of THEME_TOKENS) {
    root.style.setProperty(cssVar(token), theme[token]);
  }
}

interface ThemeState {
  name: string; // preset name, or "Custom"
  custom: Theme; // editable custom theme (seeded from Dark)
  ready: boolean;
  /** Whose appearance is loaded; null until the first workspace opens. */
  workspaceId: string | null;
  /** Read and apply a workspace's saved theme. Called on launch and on switch. */
  loadForWorkspace: (workspaceId: string) => Promise<void>;
  /** Switch to a named preset. */
  selectPreset: (name: string) => void;
  /** Edit one token of the custom theme and switch to it. */
  setCustomToken: (token: keyof Theme, value: string) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  name: DEFAULT_THEME_NAME,
  custom: { ...PRESETS[DEFAULT_THEME_NAME] },
  ready: false,
  workspaceId: null,

  async loadForWorkspace(workspaceId) {
    const [savedName, savedCustom] = await Promise.all([
      getSetting(SK.name, workspaceId),
      getSetting(SK.custom, workspaceId),
    ]);
    const custom: Theme = savedCustom
      ? { ...PRESETS[DEFAULT_THEME_NAME], ...JSON.parse(savedCustom) }
      : { ...PRESETS[DEFAULT_THEME_NAME] };
    const name = savedName ?? DEFAULT_THEME_NAME;
    const active = name === "Custom" ? custom : (PRESETS[name] ?? PRESETS[DEFAULT_THEME_NAME]);
    applyTheme(active);
    set({ name, custom, ready: true, workspaceId });
  },

  selectPreset(name) {
    const theme = PRESETS[name];
    if (!theme) return;
    applyTheme(theme);
    set({ name });
    const ws = get().workspaceId ?? undefined;
    void setSetting(SK.name, name, ws);
  },

  setCustomToken(token, value) {
    const custom = { ...get().custom, [token]: value };
    applyTheme(custom);
    set({ name: "Custom", custom });
    const ws = get().workspaceId ?? undefined;
    void setSetting(SK.name, "Custom", ws);
    void setSetting(SK.custom, JSON.stringify(custom), ws);
  },
}));
