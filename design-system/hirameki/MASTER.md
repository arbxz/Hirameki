# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/hirameki/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

> **Source of truth:** the tokens live in `src/lib/themes.ts` and `src/index.css`; this file
> records them and the reasons behind them. If the two disagree, the code wins and this file
> is out of date.

---

**Project:** Hirameki
**Updated:** 2026-10-29
**Category:** Desktop tool: an infinite, zoomable mood board across multiple boards
**Design Dials:** Variance 3/10 (Centered / Minimal) | Motion 2/10 (Subtle) | Density 7/10 (Standard)
**Derived from:** [`design-system/oriie/MASTER.md`](../oriie/MASTER.md) — the drafting-sheet
language (paper, ink, hairlines, one vermilion accent, square corners, mono labels, hover
inversion). What was taken and what was deliberately not is recorded at the bottom.

---

## The one idea

A drafting sheet, not a window of floating panels. Areas are separated by **ruled lines**, not
by shadows or rounded cards; a control announces itself by **inverting** under the cursor, the
way a selected cell on a drawing does; labels are **mono uppercase** because they name a field
rather than speak to the reader.

The difference from oriie: **Hirameki's content is images.** Chrome exists to stay out of their
way, which is why the dark presets survive and why the board is not forced onto paper.

## Global Rules

### Color: roles, not values

Hirameki is themeable — seven presets plus a user-editable custom theme — so the system is a set
of **roles** each preset fills, never fixed hexes. Every component reads `var(--token)`.

| Token | CSS var | Role | Bar it must clear |
|-------|---------|------|-------------------|
| `bg` | `--bg` | Canvas behind the board | — |
| `grid` | `--grid` | Dot grid | — |
| `surface` | `--surface` | Chrome panel background | — |
| `surfaceSolid` | `--surface-solid` | Opaque surface (modals, title bar) | — |
| `surfaceHover` | `--surface-hover` | Quiet fill where inversion is wrong | — |
| `border` | `--border` | **Decorative rule only** — dividers, panel edges, image edges | none |
| `lineStrong` | `--line-strong` | **Outline of anything clickable or typeable** | 3:1 on chrome |
| `text` | `--text` | Text, and the ink fill of an inverted control | 4.5:1 |
| `textDim` | `--text-dim` | Labels, read-outs, secondary prose | 4.5:1 |
| `accent` | `--accent` | Focus ring, selection, toast actions, section numbers | 4.5:1 |
| `accentMark` | `--accent-mark` | **Marks only** — tags, dots, group dashes. Never text | none |
| `danger` | `--danger` | Destructive actions | 4.5:1 |
| `shadow` | `--shadow` | The hard offset under chrome | — |

**Why `border` and `lineStrong` are separate.** Measured before the split, `border` scored
**1.30–2.00:1** against chrome in every preset while being used as the outline of buttons and
inputs. A decorative hairline and a control outline are different jobs with different bars, and
one token cannot serve both. `lineStrong` was solved per preset for ≥3.2:1.

**Why `accent` and `accentMark` are separate.** oriie's vermilion `#FA3600` is 3.2:1 — fine for
marking, not for text. Hirameki spends its accent on focus rings and toast actions, so `accent`
holds the text-safe value (oriie's `--accent-ink`) and `accentMark` holds the true vermilion.

**Why `danger` exists.** `text-red-400` was hardcoded in five components. It scores 5.6–6.2:1 on
the dark presets and **2.4–2.7:1 on Light, Sepia, Paper and Drafting** — the delete controls were
illegible on half the themes. No single red serves both polarities, so it is per preset.

Re-check any palette change with the contrast pass described under *Verification*.

### Typography

- **Body:** Familjen Grotesk Variable — `--font-sans`
- **Labels and figures:** Geist Mono Variable — `--mono`
- Both **self-hosted** via `@fontsource-variable/*`, imported in `src/main.tsx`. Never a webfont
  CDN: this is a desktop app and must render identically with no network.

| Role | Font | Size / weight | Case |
|------|------|---------------|------|
| Title bar, read-outs, keycaps | Mono | 11px | Sentence |
| Section labels (`.ui-label`) | Mono | 11px / 0.08em | UPPERCASE |
| Buttons with a label (`.btn`) | Sans | 12px / 600, 0.02em | UPPERCASE |
| Body, prose, note text | Sans | 12–14px | Sentence |

11px is only for mono labels. **Anything read as prose stays sentence case at 12px or larger** —
the empty-board guidance, toasts, tour cards and note bodies are prose, not labels.

### Shape and depth

- **Corner radius: 0** (`--radius-chrome`). Only genuinely round things are round: colour
  swatches and the board-colour dot (`rounded-full`).
- **Rules, not shadows.** One hairline separates areas.
- **One hard offset shadow, never blurred**: `--shadow-chrome` (3px) on chrome and canvas
  objects, `--shadow-dialog` (6px) reserved for dialogs.
- **No backdrop blur on chrome.** Glass reads as a surface hovering over the board; this language
  wants panels sitting flat on it. (Sticky notes keep their opt-in `glass` — that is content the
  user chose, not chrome.)

## Component Specs

### The hover inversion

The single gesture the whole UI shares, declared once in `index.css` rather than as a
`hover:` utility on each control:

```css
button:not(:disabled):not(.swatch):not(.danger):not(.titlebar-control):hover,
[role="menuitem"]:not([disabled]):not(.danger):hover {
  background: var(--text); color: var(--bg); border-color: var(--text);
}
```

Three opt-outs, each for a reason: `.swatch` shows a colour and inverting would hide it;
`.danger` inverts into `--danger` instead; `.titlebar-control` takes a quiet fill, with close
going red.

### Buttons

- **Labelled** → `.btn`: outlined in `--line-strong`, uppercase 12px/600, square.
- **Icon-only** → bare. Outlining each of a dozen toolbar icons makes a grid of little boxes
  where this language wants ruled cells. They are tied to the labelled ones by the inversion,
  not by a border.
- Every icon-only button carries an `aria-label`; decorative glyphs are `aria-hidden`.

### Sections

Panels marked `.sheet` number their `.ui-label.numbered` headings `01`, `02`, `03` with a CSS
counter, the number in `--accent`. **Never hand-number a heading.**

### Board tabs

The title block of a drawing. The current tab is `.tab-active` — filled with ink permanently,
which is the hover inversion held rather than a tinted highlight.

### Canvas objects

Images use **one `outline`** for all four states, never a ring or border, because outline is
drawn outside the box and costs no layout — so no state can resize the image:

| State | Outline |
|-------|---------|
| default | 1px solid `--border` |
| grouped | 2px **dashed** `--accent-mark` |
| hover | 2px solid `--accent-mark` |
| selected | 2px solid `--accent` |

Grouped is dashed rather than a second hue — the drafting idiom for "annotation about this
thing" — which is how group membership and selection stay distinct without spending another
colour.

## Motion

**Colour only, 150ms `ease-out`**, on background, colour, border, outline, box-shadow and
opacity. Nothing moves: there is no press dip and no hover lift.

> **This is load-bearing, not taste.** A canvas item's `transform` *is* its geometry —
> `SelectionLayer` writes it every gesture frame. Animating it made images trail the cursor and
> left the resize handles offset from the picture (shipped in 0.3.1, fixed in 0.3.2). **Never
> animate a property the manipulation layer drives.**

Under `prefers-reduced-motion`, transitions switch off and the swatch scale is dropped.

## Anti-Patterns (Do NOT Use)

- ❌ **Rounded corners, blur shadows, gradients or glass** on chrome
- ❌ **`transform` in a transition** on anything the canvas drives (see Motion)
- ❌ **`--border` as the outline of a control** (1.3–2.0:1). Use `--line-strong`
- ❌ **`--accent-mark` as text or behind text.** Use `--accent`
- ❌ **Raw palette colours in components** (`text-red-400`, `ring-violet-400/60`). Use a token
- ❌ **A local `hover:bg-*` on a control.** The shared inversion already covers it
- ❌ **UPPERCASE on prose.** Caps are for labels and button text only
- ❌ **Webfont CDNs.** Fonts are self-hosted
- ❌ **Emojis as icons.** Lucide only
- ❌ **Invisible focus states.** 2px `--accent`, offset 0, square

## Verification

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Then, for anything that touches colour, re-run the contrast pass: composite each preset's
`surface` over its `bg` and check `text`, `textDim`, `accent` and `danger` at 4.5:1 and
`lineStrong` at 3:1, against both chrome and canvas. All seven presets currently pass 56 of 56
checks.

For anything visual, **look at a rendered frame.** `pnpm dev` serves the front end in a plain
browser — `TitleBar` resolves its Tauri window lazily so the shell still renders there, with the
window controls inert and a "Couldn't open your boards" toast, which is expected with no
database.

## Decisions, and what was left behind

| oriie | Hirameki | Why |
|-------|----------|-----|
| Paper only | Paper is one preset of seven | The content is images; bright chrome competes with them, and most boards are viewed dark |
| `--accent` is vermilion, marks only | `--accent` is text-safe, `--accentMark` is vermilion | Hirameki spends its accent on focus rings and toast actions |
| Every button outlined | Only labelled buttons | A dozen outlined toolbar icons reads as a box grid, not a title block |
| Cobalt for selection | `--accent` for selection, dashed `--accent-mark` for groups | A themeable app cannot hard-code a selection hue |
| No glass anywhere | No glass on chrome; notes keep opt-in `glass` | The note's frosted background is a user-chosen content style |
| 300px sidebar, not responsive | Floating panels over a canvas | Different product shape; no fixed sidebar to break |

### Known gaps

- [ ] `ShortcutsModal`, `OnboardingTour` and `BackgroundModal` follow the tokens and the shape
      language but have not been given the `.btn` / `.sheet` treatment end to end.
- [ ] The settings panel is tall enough at seven presets to reach the zoom control on a short
      window. Worth a scroll region if an eighth is added.
- [ ] Not responsive, and deliberately so: this is a desktop window, not a page.
