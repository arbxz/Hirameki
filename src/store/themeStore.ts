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
// preset name and any custom overrides persist in the settings table.

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
  init: () => Promise<void>;
  /** Switch to a named preset. */
  selectPreset: (name: string) => void;
  /** Edit one token of the custom theme and switch to it. */
  setCustomToken: (token: keyof Theme, value: string) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  name: DEFAULT_THEME_NAME,
  custom: { ...PRESETS[DEFAULT_THEME_NAME] },
  ready: false,

  async init() {
    const [savedName, savedCustom] = await Promise.all([
      getSetting(SK.name),
      getSetting(SK.custom),
    ]);
    const custom: Theme = savedCustom
      ? { ...PRESETS[DEFAULT_THEME_NAME], ...JSON.parse(savedCustom) }
      : { ...PRESETS[DEFAULT_THEME_NAME] };
    const name = savedName ?? DEFAULT_THEME_NAME;
    const active = name === "Custom" ? custom : (PRESETS[name] ?? PRESETS[DEFAULT_THEME_NAME]);
    applyTheme(active);
    set({ name, custom, ready: true });
  },

  selectPreset(name) {
    const theme = PRESETS[name];
    if (!theme) return;
    applyTheme(theme);
    set({ name });
    void setSetting(SK.name, name);
  },

  setCustomToken(token, value) {
    const custom = { ...get().custom, [token]: value };
    applyTheme(custom);
    set({ name: "Custom", custom });
    void setSetting(SK.name, "Custom");
    void setSetting(SK.custom, JSON.stringify(custom));
  },
}));
