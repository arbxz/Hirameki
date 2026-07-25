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

- Writing user bytes to disk under the app-data dir ([src-tauri/src/storage.rs](src-tauri/src/storage.rs) `save_bytes` — the shared helper behind images and audio).
- Downloading remote image URLs, bypassing browser CORS, with timeout / redirect / 64 MiB size caps ([src-tauri/src/images.rs](src-tauri/src/images.rs) `download_image`).
- Reading/writing arbitrary user-chosen paths for export/import, outside the WebView fs ACL scope ([src-tauri/src/bundle.rs](src-tauri/src/bundle.rs)).

**JS owns the database.** The SQLite connection lives on the front end via `tauri-plugin-sql` ([src/lib/db.ts](src/lib/db.ts), single shared `sqlite:inspo.db` connection). Rust never touches the DB. This is why export/import is a two-sided dance: JS dumps/applies the DB rows as an opaque `manifest` string, Rust embeds/restores the referenced asset files ([src/lib/exportImport.ts](src/lib/exportImport.ts) ↔ `bundle.rs`).

Tauri commands are registered in [src-tauri/src/lib.rs](src-tauri/src/lib.rs): `save_image`, `download_image`, `save_audio`, `export_data`, `import_data`. Migrations are also registered there and run automatically on DB load.

### Data model & persistence

Schema lives in [src-tauri/migrations/](src-tauri/migrations/) (versioned `.sql` files, applied in order). Core canvas tables — `boards`, `groups`, `items`, `notes` — plus `settings` (key/value) and `tracks` (music). Everything is scoped to a board and cascade-deletes via FK.

- **DB columns are `snake_case`; app types are `camelCase`.** [src/lib/repo.ts](src/lib/repo.ts) owns the SQL + row⇄domain mapping for `boards`/`groups`/`items`; the parallel [src/lib/notes.ts](src/lib/notes.ts) (notes) and [src/lib/tracks.ts](src/lib/tracks.ts) (music) do the same for their own tables. Everything above these works purely in the domain types. Add a column → update the migration, the `*Row` interface, the mapper, and the type.
- **Binary assets are never stored in the DB.** Files are written to `<app_data>/images/<uuid>.<ext>` and `<app_data>/audio/...`; the DB stores only the *relative* path. The front end resolves that back to a loadable URL with `convertFileSrc` via [src/lib/assets.ts](src/lib/assets.ts) `resolveAssetSrc`. The asset protocol is scoped to `$APPDATA/**` in [tauri.conf.json](src-tauri/tauri.conf.json).

### State: Zustand stores

Three stores, each self-initializing (guard against React StrictMode's double-mount via a module-level `initStarted` flag):

- [src/store/boardStore.ts](src/store/boardStore.ts) — the big one. Holds the active board, all boards, items, groups. Every mutation follows **optimistic-update-then-persist**: patch in-memory state via `set`, then call the matching `repo.ts` function. High-frequency writes (viewport pan/zoom) are **debounced** (400 ms) with a `flush()` escape hatch fired on board-switch and window close so the last position is never lost. Grouping, z-ordering, and multi-select expansion all live here.
- [src/store/themeStore.ts](src/store/themeStore.ts) — applies a theme by writing CSS custom properties onto `<html>`; presets + a custom editor live in [src/lib/themes.ts](src/lib/themes.ts). All UI colors are `var(--...)` tokens.
- [src/store/musicStore.ts](src/store/musicStore.ts) — wraps a single `HTMLAudioElement`. Playlist = a bundled default track (a synthetic `Track` with no DB row, Vite-resolved asset URL) + user tracks. Note the autoplay handling: WebViews block autoplay until a user gesture, so a persisted "playing" state arms a one-shot first-interaction retry.

Play/mute/volume/theme/active-board and other prefs persist to the `settings` table via [src/lib/settings.ts](src/lib/settings.ts).

### The canvas

[src/components/Canvas.tsx](src/components/Canvas.tsx) is the heart of the UI and the most subtle file. It composes `react-infinite-viewer` (pan/zoom) with a `SelectionLayer` ([src/components/SelectionLayer.tsx](src/components/SelectionLayer.tsx)) built on `react-moveable` + `react-selecto` for drag/resize/rotate/marquee. Key things to preserve when editing:

- **Viewport restore is timing-sensitive.** Restoring a saved pan/zoom is deferred to a `requestAnimationFrame` (the viewer must finish measuring first), and a `restoringRef` guard suppresses the echo `scroll`/`pinch` events the viewer re-emits during a programmatic restore — otherwise those intermediate values overwrite the saved viewport and corrupt it for the next launch.
- The dot grid is a CSS `radial-gradient` background whose size/position is driven manually from `zoom`/`scroll` — it is *not* inside the transformed viewport.
- `SelectionLayer` renders in **screen space** (outside the scaled viewport) so moveable's control box aligns; it's fed the live `viewport` transform to convert coordinates.
- WebView2 hijacks Ctrl+wheel for native zoom, so a passive-false wheel handler `preventDefault()`s it.

### Sticky notes

Notes are text cards on the canvas, deliberately kept **independent of the image
manipulation system**. Images use the `react-moveable`/`react-selecto` layer; notes
instead have their own `notes` table, a boardStore slice (`addNote`/`patchNoteText`/
`commitNoteGeom`/`setNoteStyle`/`removeNote`/`bringNoteToFront`), and self-contained
pointer-based drag (by the header) + resize (by the corner) in
[src/components/NoteView.tsx](src/components/NoteView.tsx) — screen deltas convert to
world units via `/ zoom`. Notes render in the world div *after* items (always above
images; z-order applies among notes only). The only cross-cutting touch is Canvas's
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

Drop / paste / upload / image-link all funnel through [src/lib/ingest.ts](src/lib/ingest.ts). A `DataTransfer` prefers real image files; otherwise it falls back to a dragged/pasted URL (`text/uri-list` or plain text). Each image is measured for aspect ratio *before* persisting (via an object URL) so there's no post-load resize flicker, scaled to `DEFAULT_MAX_DIM` (360) on its longest edge, and multi-drops cascade by 28px. `tauri.conf.json` sets `dragDropEnabled: false` on the window so the WebView (not the OS) handles HTML5 drop events.

### Window shell

Frameless window (`decorations: false`) with a custom [src/components/TitleBar.tsx](src/components/TitleBar.tsx) providing the window controls. Desktop-only plugins (updater + process-relaunch) are gated behind `#[cfg(desktop)]` in `lib.rs`. `checkForUpdates({ silent: true })` runs on launch ([src/lib/updater.ts](src/lib/updater.ts)); the updater endpoint and pubkey are in `tauri.conf.json`.

## Conventions

- Path aliases: none — relative imports throughout.
- Styling: Tailwind CSS 4 (via `@tailwindcss/vite`) + CSS variable theme tokens; prefer `var(--token)` over hard-coded colors so themes keep working. Global tokens/utilities live in [src/index.css](src/index.css) and [src/App.css](src/App.css).
- Icons: `lucide-react`.
- IDs are UUIDs generated in `repo.ts` on create.
- When adding a Tauri command, register it in the `generate_handler!` list in `lib.rs`; when adding a schema change, add a *new* numbered migration file and register it there too (never edit an applied migration).
