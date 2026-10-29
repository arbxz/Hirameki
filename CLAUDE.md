# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hirameki (package name `hirameki`, product name `Hirameki`, identifier `com.arbxz.hirameki`) is a Tauri 2 desktop mood-board app: an infinite, zoomable canvas for collecting and arranging images across multiple boards, all stored locally. React 19 + TypeScript + Vite 7 front end; Rust (Tauri) back end; SQLite for data; the app-data dir for binary assets.

## Commands

Package manager is **pnpm**. Node + the Rust toolchain with [Tauri prerequisites](https://tauri.app/start/prerequisites/) are required.

```bash
pnpm install         # install JS deps (Cargo deps fetch on first Rust build)
pnpm tauri dev       # run the full app (spawns `pnpm dev` on :1420, then the Rust shell)
pnpm tauri build     # production installer + updater artifacts (needs signing key — see below)
pnpm dev             # front end only in a browser (no Tauri APIs; most features won't work)
pnpm build           # tsc typecheck + vite build (production build)

pnpm lint            # ESLint (flat config; run lint:fix to autofix)
pnpm typecheck       # tsc --noEmit
pnpm test            # Vitest, run once (test:watch for watch mode)
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `lint` + `typecheck` + `test` on every push and PR (front end only, no Rust build). Rust side: `cargo build` / `cargo clippy` from `src-tauri/`.

### Tests & lint

- **Vitest**, config in [vitest.config.ts](vitest.config.ts), Node environment. Tests live next to their subject as `*.test.ts` under `src/`. They cover pure front-end logic — geometry, URL/ext parsing, manifest validation, and the board-store reducers — with the Tauri DB/asset layers (`../lib/repo`, `../lib/settings`, `@tauri-apps/*`) `vi.mock`ed, so no DB or Tauri runtime is needed. When testing store logic, drive it via `useBoardStore.setState(...)` / `.getState()` rather than mounting React.
- **ESLint** flat config in [eslint.config.js](eslint.config.js) (typescript-eslint + react-hooks + react-refresh). The react-hooks v7 React-Compiler rules `set-state-in-effect` and `refs` are intentionally **off** — they flag deliberate, correct patterns in the canvas/viewport code (after-mount flags, latest-value refs written during render). `rules-of-hooks` and `exhaustive-deps` remain on. A few `react-refresh/only-export-components` warnings are expected and don't fail CI.

Production builds are signed for the auto-updater and need the Tauri signing key in the environment (`TAURI_SIGNING_PRIVATE_KEY` + password). See [docs/releasing-updates.md](docs/releasing-updates.md); releases are driven by the tag-triggered [.github/workflows/release.yml](.github/workflows/release.yml).

## Architecture

### The JS ⇄ Rust split (important)

Work is divided by capability, not just by layer. **Rust owns anything the WebView can't safely do:**

- Writing user bytes to disk under the app-data dir ([src-tauri/src/storage.rs](src-tauri/src/storage.rs) `save_bytes` — the shared helper behind image saving).
- Downloading remote image URLs, bypassing browser CORS, with timeout / redirect / 64 MiB size caps ([src-tauri/src/images.rs](src-tauri/src/images.rs) `download_image`).
- Reading/writing arbitrary user-chosen paths for export/import, outside the WebView fs ACL scope ([src-tauri/src/bundle.rs](src-tauri/src/bundle.rs)).

**JS owns the database.** The SQLite connection lives on the front end via `tauri-plugin-sql` ([src/lib/db.ts](src/lib/db.ts), single shared `sqlite:inspo.db` connection). Rust never touches the DB. This is why export/import is a two-sided dance: JS dumps/applies the DB rows as an opaque `manifest` string, Rust embeds/restores the referenced asset files ([src/lib/exportImport.ts](src/lib/exportImport.ts) ↔ `bundle.rs`).

A bundle carries a `version` and a `scope`, both `#[serde(default)]` so files written before they existed still parse. **`scope: "workspace"` is additive** — `remapIds` gives every row a fresh id and rewires the foreign keys (including the board id stored as the *value* of `board.activeId`), so the bundle lands as a new workspace without touching anything already here. Asset paths are deliberately *not* remapped: assets are keyed by relative path and restored to the same one, so two workspaces referencing one picture share a single file. **`scope: "all"` is the device-wide replace**, and is the only path that still wipes. A version-less bundle is treated as a workspace import, because its boards have no workspace to belong to and an old backup must not wipe a machine that has since grown several. Adding a table means updating `TABLE_COLUMNS`, `INSERT_ORDER` **and** `WIPE_ORDER`, or exports silently drop it and imports throw.

Tauri commands are registered in [src-tauri/src/lib.rs](src-tauri/src/lib.rs): `save_image`, `download_image`, `export_data`, `import_data`. Migrations are also registered there and run automatically on DB load.

### Data model & persistence

Schema lives in [src-tauri/migrations/](src-tauri/migrations/) (versioned `.sql` files, applied in order). Core canvas tables — `boards`, `groups`, `items`, `notes` — plus `settings` (key/value) and `tracks`. `tracks` (and `<app_data>/audio/`) are **legacy**: the music widget was removed, but the table and files are left in place and still ride along in export/import (import wipes every table, so dropping tracks from the bundle would delete them). Nothing else reads them. Everything is scoped to a board and cascade-deletes via FK.

- **DB columns are `snake_case`; app types are `camelCase`.** The camelCase domain types `Board`/`Group`/`Item` live in [src/types/board.ts](src/types/board.ts); [src/lib/repo.ts](src/lib/repo.ts) owns the SQL + row⇄domain mapping for those tables, and the parallel [src/lib/notes.ts](src/lib/notes.ts) does the same for notes, declaring their types inline. Everything above these works purely in the domain types. Add a column → update the migration, the `*Row` interface, the mapper, and the type.
- **Binary assets are never stored in the DB.** Files are written to `<app_data>/images/<uuid>.<ext>`; the DB stores only the *relative* path. The front end resolves that back to a loadable URL with `convertFileSrc` via [src/lib/assets.ts](src/lib/assets.ts) `resolveAssetSrc`. The asset protocol is scoped to `$APPDATA/**` in [tauri.conf.json](src-tauri/tauri.conf.json).

### State: Zustand stores

Two data stores, each self-initializing (guard against React StrictMode's double-mount via a module-level `initStarted` flag), plus a transient toast store:

- [src/store/boardStore.ts](src/store/boardStore.ts) — the big one. Holds the active board, all boards, items, groups. Every mutation follows **optimistic-update-then-persist**: patch in-memory state via `set`, then call the matching `repo.ts` function. High-frequency writes (viewport pan/zoom) are **debounced** (400 ms) with a `flush()` escape hatch fired on board-switch and window close so the last position is never lost. Grouping, z-ordering, and multi-select expansion all live here.
  - **Undo/redo** is a command stack of inverse closures in the same store (`record(...)`, capped at 100, dropped on board switch). A mutation that should be undoable calls `record({ label, undo, redo })` with whatever it needs to reverse itself; an `applying` flag keeps replays from recording entries of their own. Restores re-insert rows with their **original ids** (`createItem`/`createNote` accept `id`, `repo.restoreGroup` for groups), and pruned groups come back *before* their members or the items→groups FK fails. Note text is deliberately not recorded — the textarea's native undo owns it. Entries with the same `mergeKey` recorded within 1 s fold into one (first undo, latest redo), which is how a run of arrow-key nudges undoes as a single move.
  - Persistence failures go through `fail()`, which toasts. `removeItems`/`removeNote` etc. report and **resolve** rather than throw, so a caller that follows up (the Undo toast in Canvas) checks that `undoId` actually changed.
- [src/store/themeStore.ts](src/store/themeStore.ts) — applies a theme by writing CSS custom properties onto `<html>`; presets + a custom editor live in [src/lib/themes.ts](src/lib/themes.ts). All UI colors are `var(--...)` tokens.
- [src/store/toastStore.ts](src/store/toastStore.ts) — transient notifications (info / success / error / progress, optional single action) rendered by [Toaster.tsx](src/components/Toaster.tsx). Anything may call `toast.*`; auto-dismiss timers live outside React state and pause while the pointer or focus is on a toast.

Theme, active board and other prefs persist to the `settings` table via [src/lib/settings.ts](src/lib/settings.ts).

### Workspaces

A **workspace** is the container above boards — separate sets of boards, like
separate users of the app. Migration
[007_workspaces.sql](src-tauri/migrations/007_workspaces.sql) adds the
`workspaces` table and `boards.workspace_id`; everything below a board (items,
groups, notes) reaches its workspace through the board and needed no change.

- **A workspace owns its boards and its appearance.** `settings` was rebuilt
  with a nullable `workspace_id` — `NULL` means global. Scoped: `theme.name`,
  `theme.custom`, `board.activeId`. Global: `onboarding.seen`,
  `workspace.activeId`, `workspace.defaultId`, `workspace.loadLast` (the three
  that decide *which* workspace to open, so they cannot live inside one). The
  scope is the second argument to `getSetting`/`setSetting`; omitting it means
  global, which is why every pre-existing global caller reads unchanged.
- **One init entry point.** `App.tsx` calls `workspaceStore.init()` only. It
  resolves the workspace to open via the pure `resolveLaunchWorkspace`, then
  calls `boardStore.openWorkspace(id)` and `themeStore.loadForWorkspace(id)`.
  The arrow points one way — neither of those imports `workspaceStore` — so
  there is no cycle and both stay testable on their own. `boardStore.init()`
  and `themeStore.init()` no longer exist.
- **`openWorkspace` runs on every switch**, not just at launch, so it has no
  `initStarted` guard (StrictMode is handled a level up). It flushes pending
  viewport/note writes and **drops undo history** before loading: entries close
  over rows belonging to the workspace that recorded them.
- **`repo.ts` is workspace-scoped where it has to be**: `listBoards`,
  `createBoard` (including its `MAX(position)`) and `reorderBoards` all take a
  workspace id. `loadOrCreateDefaultBoard` is gone — it inserted a board with
  the literal id `"default"`, which cannot survive more than one workspace.
  `loadOrCreateFirstBoard(workspaceId)` replaces it.

### Boards, tabs & backgrounds

A board is the unit of everything — items, groups, and notes all FK to it and
cascade-delete with it. Multi-board support lives across migration
[003_board_tabs.sql](src-tauri/migrations/003_board_tabs.sql) (adds `color` for the
tab tag and `position` for explicit tab order) and
[BoardTabs.tsx](src/components/BoardTabs.tsx), a row of buttons rendered inside the
canvas toolbar: click to switch, right-click for rename / background / delete, `+` to
create. Every dialog it opens — create/rename ([BoardModal.tsx](src/components/BoardModal.tsx)),
background, delete-confirm — goes through the shared full-screen
[Modal.tsx](src/components/Modal.tsx) so nothing is clipped by the toolbar.
Board CRUD + `reorderBoards` are boardStore actions backed by `repo.ts`.

- The active board id persists to `settings` under `board.activeId`, so the app
  reopens on the board you left.
- `switchBoard` restores the target board's viewport **from the in-memory `boards`
  array**, which is why `setView` writes live pan/zoom into *both* `board` and the
  matching entry in `boards` — otherwise switching back snaps to a stale position.

**Per-board background** (migration
[004_board_background.sql](src-tauri/migrations/004_board_background.sql):
`bg_path` / `bg_url` / `bg_fit`). At most one of `bgPath` (an imported file under the
app images dir) or `bgUrl` (a remote link) is set; `bgFit` is `"cover"` or
`"contain"`. Link backgrounds are referenced **directly, not downloaded**, so
animated gifs stream from the source and export bundles stay small.
[BoardBackground.tsx](src/components/BoardBackground.tsx) renders it as an `<img>`
with `object-fit` — not a CSS background — so gifs reliably animate and contain-mode
letterboxing is exact. It sits behind the dot grid and **deliberately does not pan or
zoom with the viewport**; keep it outside the transformed world div.
[BackgroundModal.tsx](src/components/BackgroundModal.tsx) is the editor (upload /
paste link / fit / remove), writing through the store's `setBoardBackground` →
`repo.ts` `updateBoardBackground`.

### The canvas

[src/components/Canvas.tsx](src/components/Canvas.tsx) is the heart of the UI and the most subtle file. It composes `react-infinite-viewer` (pan/zoom) with a `SelectionLayer` ([src/components/SelectionLayer.tsx](src/components/SelectionLayer.tsx)) built on `react-moveable` + `react-selecto` for drag/resize/rotate/marquee. Key things to preserve when editing:

- **Viewport restore is timing-sensitive.** Restoring a saved pan/zoom is deferred to a `requestAnimationFrame` (the viewer must finish measuring first), and a `restoringRef` guard suppresses the echo `scroll`/`pinch` events the viewer re-emits during a programmatic restore — otherwise those intermediate values overwrite the saved viewport and corrupt it for the next launch.
- The dot grid is a CSS `radial-gradient` background whose size/position is driven manually from `zoom`/`scroll` — it is *not* inside the transformed viewport.
- `SelectionLayer` renders in **screen space** (outside the scaled viewport) so moveable's control box aligns; it's fed the live `viewport` transform to convert coordinates.
- **Ctrl+wheel is handled entirely by Canvas**, not the viewer (`useWheelPinch={false}`). A capture-phase, passive-false window listener `preventDefault()`s it (WebView2 would otherwise page-zoom) and `stopPropagation()`s it away from InfiniteViewer's wheel-pinch, then calls `zoomAt`, which zooms about the cursor by solving `screenToWorld` for the new scroll. One handler serves two very different inputs, so the delta magnitude picks between them: a mouse notch is a single ±100 and gets a fixed step; a **touchpad pinch** streams small/fractional deltas and gets a delta-proportional rate.
- **Trackpad pinch arrives through that same handler — and WebView2's pinch setting must stay on.** Chromium reports a precision-touchpad pinch to the page as a stream of synthetic ctrl+wheel events *first*, and only applies its own "Page Scale" zoom if the page doesn't `preventDefault()` them. With `IsPinchZoomEnabled = false` Windows treats the pinch as a two-finger pan instead, and the page only sees small horizontal (non-ctrl) wheel events — confirmed by recording a real pinch. Tauri doesn't expose that setting directly: **wry sets `IsPinchZoomEnabled` (and `IsZoomControlEnabled`) from the window's `zoomHotkeysEnabled`**, so [tauri.conf.json](src-tauri/tauri.conf.json) sets it to `true`. That also arms WebView2's Ctrl+= / Ctrl+- / Ctrl+0 page zoom, which Canvas cancels in a capture-phase keydown listener and maps to canvas zoom instead. macOS is a separate path — WKWebView sends gesture events, which is why the viewer's `useGesture` stays on.

### Sticky notes

Notes are text cards on the canvas, deliberately kept **independent of the image
manipulation system**. Images use the `react-moveable`/`react-selecto` layer; notes
instead have their own `notes` table, a boardStore slice (`addNote`/`patchNoteText`/
`commitNoteGeom`/`setNoteStyle`/`removeNote`/`bringNoteToFront`), and self-contained
pointer-based drag (by the header) + resize (by the corner) in
[src/components/NoteView.tsx](src/components/NoteView.tsx) — screen deltas convert to
world units via `/ zoom`, using the zoom **captured at pointer-down** (the delta is
measured from the gesture's anchor, so a live zoom would re-scale the whole
accumulated delta at once and make the note jump). Notes render in the world div *after* items (always above
images; z-order applies among notes only) — but unlike items, which are **sorted by
`z` into DOM order** because `ItemView` sets no `zIndex`, notes stack via an explicit
`zIndex` and must stay in **stable array order**. Sorting them would reorder the DOM
on `bringNoteToFront`, and moving a node mid-gesture implicitly releases its pointer
capture, stranding the drag/resize so it keeps tracking the cursor after the button
is released. `NoteView` also ends a gesture on `lostpointercapture` and on any move
with no button held, as a backstop. The only cross-cutting touch is Canvas's
`Selecto` `dragCondition`, which excludes `.sticky-note` so note interactions don't
start a marquee. Styling/persistence live in [src/lib/notes.ts](src/lib/notes.ts):
`color` is a fixed-palette key or `null` (= follow `--accent` via `color-mix`, so
uncolored notes restyle with the theme); `glass` toggles a frosted background;
`fontSize` is a per-note base text size set by the header A−/A+ stepper (walks the
`NOTE_FONT_SIZES` ladder via `stepFontSize`). Note text is persisted **debounced**
(per-note) so typing doesn't hammer the DB. New notes are created from the top-right
button ([SettingsPanel](src/components/SettingsPanel.tsx)) or the canvas right-click menu.

**Zoom legibility** (in NoteView, purely visual — nothing persisted): body text
scales **literally** with the canvas (size is set manually via A−/A+; there is no
auto floor). Only the header icons + resize handle get a **mild sqrt-dampened,
clamped counter-scale** so they shrink more gently when zoomed out — derived from
the `zoom` prop Canvas passes down.

### Ingestion pipeline

Drop / paste / upload / image-link all funnel through [src/lib/ingest.ts](src/lib/ingest.ts). A `DataTransfer` prefers real image files; otherwise it falls back to a dragged/pasted URL (`text/uri-list` or plain text). Each image is measured for aspect ratio *before* persisting (via an object URL) so there's no post-load resize flicker, scaled to `DEFAULT_MAX_DIM` (360, defined with `fitDimensions` in [src/lib/images.ts](src/lib/images.ts)) on its longest edge, and multi-drops cascade by 28px. `tauri.conf.json` sets `dragDropEnabled: false` on the window so the WebView (not the OS) handles HTML5 drop events.

### Window shell

Frameless window (`decorations: false`) with a custom [src/components/TitleBar.tsx](src/components/TitleBar.tsx) providing the window controls. Desktop-only plugins (updater + process-relaunch) are gated behind `#[cfg(desktop)]` in `lib.rs`. `checkForUpdates({ silent: true })` runs on launch ([src/lib/updater.ts](src/lib/updater.ts)); the updater endpoint and pubkey are in `tauri.conf.json`.

## UI design system

[`design-system/hirameki/MASTER.md`](design-system/hirameki/MASTER.md) is the design system — a
drafting sheet: square corners, hairlines, mono UPPERCASE labels, one shared hover inversion,
and colour-only motion. It is derived from
[`design-system/oriie/MASTER.md`](design-system/oriie/MASTER.md) and records what was taken from
it and what deliberately was not. **Read it before any UI change.**

Three things from it that are load-bearing rather than cosmetic:

- **Never put `transform` in a transition on anything the canvas drives.** An item's transform
  *is* its geometry (`SelectionLayer` writes it every gesture frame), so animating it makes the
  image trail the cursor and strands moveable's handles. This shipped in 0.3.1 and was fixed in
  0.3.2.
- **`--border` is decorative; `--line-strong` outlines controls.** The old single token scored
  1.3–2.0:1 across the presets while being used as a button border.
- **`--accent` carries text; `--accent-mark` does not.** Likewise `--danger` is per preset,
  because the hardcoded `text-red-400` it replaced was 2.4:1 on the light themes.

Tokens live in [src/lib/themes.ts](src/lib/themes.ts) (the seven presets and the custom editor)
and [src/index.css](src/index.css) (shape, type and the shared primitives `.chrome`, `.btn`,
`.ui-label`, `.sheet`, `.mark`, `.tab-active`). Adding a token means adding it to the `Theme`
interface, `THEME_TOKENS`, **every** preset and `TOKEN_LABELS` in `SettingsPanel` — the theme
store merges saved custom themes over the default preset, so existing custom themes backfill
new tokens on their own.

## Conventions

- Path aliases: none — relative imports throughout.
- Styling: Tailwind CSS 4 (via `@tailwindcss/vite`) + CSS variable theme tokens; prefer `var(--token)` over hard-coded colors so themes keep working. Global tokens/utilities live in [src/index.css](src/index.css).
- Icons: `lucide-react`.
- IDs are UUIDs generated in `repo.ts` on create.
- When adding a Tauri command, register it in the `generate_handler!` list in `lib.rs`; when adding a schema change, add a *new* numbered migration file and register it there too (never edit an applied migration).
