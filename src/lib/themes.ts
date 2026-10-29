// Theme = a set of CSS-variable values, applied to <html> by the theme store.
// Tokens drive the canvas background, grid, and all UI chrome (panels, text,
// borders, accent). Colors may be any CSS color string, including rgba so glassy
// chrome can carry its own alpha.

export interface Theme {
  bg: string; // canvas background
  grid: string; // grid dot color (usually rgba)
  surface: string; // chrome panel background (usually rgba for glass)
  surfaceSolid: string; // opaque surface for modals
  surfaceHover: string; // hover overlay on chrome
  border: string; // decorative hairline (dividers, panel edges) — never a control outline
  lineStrong: string; // outline of anything clickable or typeable (>=3:1 on chrome)
  text: string; // primary text
  textDim: string; // muted text
  accent: string; // highlight (selection chips, focus, toast actions) — must carry text
  accentMark: string; // decorative marks only (tags, rules, dots). Never text, never under text
  danger: string; // destructive actions (delete, remove) — carries text, so >=4.5:1
  shadow: string; // hard offset shadow under chrome (see .chrome in index.css)
}

export const THEME_TOKENS: (keyof Theme)[] = [
  "bg",
  "grid",
  "surface",
  "surfaceSolid",
  "surfaceHover",
  "border",
  "lineStrong",
  "text",
  "textDim",
  "accent",
  "accentMark",
  "danger",
  "shadow",
];

// kebab CSS var name for a token (bg -> --bg, surfaceSolid -> --surface-solid).
export function cssVar(token: keyof Theme): string {
  return "--" + token.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

export const PRESETS: Record<string, Theme> = {
  Dark: {
    bg: "#171717",
    grid: "rgba(255,255,255,0.10)",
    surface: "rgba(38,38,38,0.90)",
    surfaceSolid: "#262626",
    surfaceHover: "rgba(255,255,255,0.10)",
    border: "rgba(255,255,255,0.10)",
    lineStrong: "rgba(255,255,255,0.36)",
    text: "#f5f5f5",
    textDim: "#a3a3a3",
    accent: "#38bdf8",
    accentMark: "#38bdf8",
    danger: "#f87171",
    shadow: "rgba(0, 0, 0, 0.55)",
  },
  Light: {
    bg: "#f5f5f4",
    grid: "rgba(0,0,0,0.10)",
    surface: "rgba(255,255,255,0.90)",
    surfaceSolid: "#ffffff",
    surfaceHover: "rgba(0,0,0,0.06)",
    border: "rgba(0,0,0,0.12)",
    lineStrong: "rgba(28,25,23,0.49)",
    text: "#1c1917",
    textDim: "#6b645f",
    // sky-700, not sky-500: it colours text (toast actions) and the focus
    // ring, and sky-500 was 2.8:1 on white.
    accent: "#0369a1",
    accentMark: "#0369a1",
    danger: "#b42318",
    shadow: "rgba(28, 25, 23, 0.20)",
  },
  Sepia: {
    bg: "#efe7d8",
    grid: "rgba(90,70,40,0.14)",
    surface: "rgba(245,238,224,0.92)",
    surfaceSolid: "#f3ecdc",
    surfaceHover: "rgba(120,90,50,0.10)",
    border: "rgba(120,90,50,0.20)",
    lineStrong: "rgba(67,52,32,0.58)",
    text: "#433420",
    // Both darkened for contrast on the parchment surface: muted text was
    // 3.7:1 and the accent 3.2:1, under the 4.5:1 small-text bar.
    textDim: "#735f43",
    accent: "#8f5a1c",
    accentMark: "#8f5a1c",
    danger: "#b42318",
    shadow: "rgba(67, 52, 32, 0.22)",
  },
  Paper: {
    bg: "#fefefe",
    grid: "rgba(30,30,30,0.13)",
    surface: "rgba(254,254,254,0.92)",
    surfaceSolid: "#ffffff",
    surfaceHover: "rgba(30,30,30,0.07)",
    // A real ink line, not a hairline tint: this preset leans on borders
    // instead of fills to separate chrome from the canvas.
    border: "rgba(30,30,30,0.32)",
    lineStrong: "rgba(30,30,30,0.50)",
    text: "#1e1e1e",
    textDim: "#5c5c5c",
    // typesafe.ai's pink is 2.4:1 on paper. Same hue, taken deep enough to
    // carry text and focus rings (5.9:1).
    accent: "#c2185b",
    accentMark: "#c2185b",
    danger: "#b42318",
    shadow: "rgba(30,30,30,0.22)",
  },
  Midnight: {
    bg: "#0b1020",
    grid: "rgba(120,160,255,0.10)",
    surface: "rgba(20,28,52,0.90)",
    surfaceSolid: "#141c34",
    surfaceHover: "rgba(140,170,255,0.12)",
    border: "rgba(140,170,255,0.14)",
    lineStrong: "rgba(230,236,255,0.39)",
    text: "#e6ecff",
    textDim: "#8da2c9",
    accent: "#7c9cff",
    accentMark: "#7c9cff",
    danger: "#f87171",
    shadow: "rgba(0, 0, 0, 0.55)",
  },
  Forest: {
    bg: "#0f1a14",
    grid: "rgba(120,220,160,0.10)",
    surface: "rgba(20,38,28,0.90)",
    surfaceSolid: "#142a1d",
    surfaceHover: "rgba(120,220,160,0.12)",
    border: "rgba(120,220,160,0.14)",
    lineStrong: "rgba(231,245,236,0.38)",
    text: "#e7f5ec",
    textDim: "#8fc7a4",
    accent: "#4ade80",
    accentMark: "#4ade80",
    danger: "#f87171",
    shadow: "rgba(0, 0, 0, 0.55)",
  },
  // oriie's drafting sheet, brought across whole: warm paper, ink, hairlines
  // and one vermilion. The accent is oriie's text-safe --accent-ink (5.2:1),
  // because hirameki spends its accent on focus rings and toast actions;
  // accentMark carries the true vermilion, which is 3.4:1 and marks only.
  Drafting: {
    bg: "#efeee9",
    grid: "rgba(40,40,40,0.13)",
    surface: "rgba(239,238,233,0.93)",
    surfaceSolid: "#f7f6f2",
    surfaceHover: "rgba(40,40,40,0.07)",
    border: "#b3b3af",
    lineStrong: "#84837e",
    text: "#282828",
    textDim: "#5e5e5b",
    accent: "#c42a00",
    accentMark: "#fa3600",
    danger: "#b42318",
    shadow: "rgba(40,40,40,0.18)",
  },
};

export const DEFAULT_THEME_NAME = "Dark";
