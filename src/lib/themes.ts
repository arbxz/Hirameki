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
  border: string; // hairline ring color
  text: string; // primary text
  textDim: string; // muted text
  accent: string; // highlight (selection chips, focus)
}

export const THEME_TOKENS: (keyof Theme)[] = [
  "bg",
  "grid",
  "surface",
  "surfaceSolid",
  "surfaceHover",
  "border",
  "text",
  "textDim",
  "accent",
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
    text: "#f5f5f5",
    textDim: "#a3a3a3",
    accent: "#38bdf8",
  },
  Light: {
    bg: "#f5f5f4",
    grid: "rgba(0,0,0,0.10)",
    surface: "rgba(255,255,255,0.90)",
    surfaceSolid: "#ffffff",
    surfaceHover: "rgba(0,0,0,0.06)",
    border: "rgba(0,0,0,0.12)",
    text: "#1c1917",
    textDim: "#78716c",
    // sky-700, not sky-500: it colours text (toast actions) and the focus
    // ring, and sky-500 was 2.8:1 on white.
    accent: "#0369a1",
  },
  Sepia: {
    bg: "#efe7d8",
    grid: "rgba(90,70,40,0.14)",
    surface: "rgba(245,238,224,0.92)",
    surfaceSolid: "#f3ecdc",
    surfaceHover: "rgba(120,90,50,0.10)",
    border: "rgba(120,90,50,0.20)",
    text: "#433420",
    // Both darkened for contrast on the parchment surface: muted text was
    // 3.7:1 and the accent 3.2:1, under the 4.5:1 small-text bar.
    textDim: "#735f43",
    accent: "#8f5a1c",
  },
  Midnight: {
    bg: "#0b1020",
    grid: "rgba(120,160,255,0.10)",
    surface: "rgba(20,28,52,0.90)",
    surfaceSolid: "#141c34",
    surfaceHover: "rgba(140,170,255,0.12)",
    border: "rgba(140,170,255,0.14)",
    text: "#e6ecff",
    textDim: "#8da2c9",
    accent: "#7c9cff",
  },
  Forest: {
    bg: "#0f1a14",
    grid: "rgba(120,220,160,0.10)",
    surface: "rgba(20,38,28,0.90)",
    surfaceSolid: "#142a1d",
    surfaceHover: "rgba(120,220,160,0.12)",
    border: "rgba(120,220,160,0.14)",
    text: "#e7f5ec",
    textDim: "#8fc7a4",
    accent: "#4ade80",
  },
};

export const DEFAULT_THEME_NAME = "Dark";
