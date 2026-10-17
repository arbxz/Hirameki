# Development guide

Everything needed to get Hirameki running locally, find your way around the
code, and avoid the traps that are specific to a Tauri app on Windows.

For the deep architecture notes — why the canvas is built the way it is, how
undo/redo records itself, the exact viewport-restore dance — see
[CLAUDE.md](../CLAUDE.md) in the repo root. This guide is the map; that file is
the terrain.

## Prerequisites

| Tool | Notes |
| --- | --- |
| [Node.js](https://nodejs.org/) 20+ with [pnpm](https://pnpm.io/) | `corepack enable pnpm` is enough |
| [Rust toolchain](https://www.rust-lang.org/tools/install) | stable |
| [Tauri prerequisites](https://tauri.app/start/prerequisites/) | on Windows: Visual Studio Build Tools with the C++ workload, and the WebView2 runtime (already present on Windows 11) |

The first Rust build downloads and compiles several hundred crates and takes a
while. Later builds reuse that cache.

## Running it

```bash
pnpm install         # JS dependencies (Cargo crates fetch on first Rust build)
pnpm tauri dev       # the real app: Vite on :1420, then the Rust shell
pnpm tauri build     # production installer + updater artifacts
```

**`pnpm dev` alone opens the front end in a browser, where the app does not
work.** `TitleBar.tsx` calls the Tauri window API as the module loads, so the
page throws before it renders, and nothing that touches the database or the
filesystem has an implementation outside the shell. Use it only to check
something purely visual, and expect the console to be loud.

`pnpm tauri build` fails without the updater signing key in the environment,
because `bundle.createUpdaterArtifacts` is on. To build without releasing:

```bash
pnpm tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

[Releasing updates](releasing-updates.md) covers the key itself.

## Checks

```bash
pnpm typecheck       # tsc --noEmit
pnpm lint            # ESLint (lint:fix to autofix)
pnpm test            # Vitest, single run (test:watch while working)
```

CI ([`ci.yml`](../.github/workflows/ci.yml)) runs all three on every push and
pull request. It does not build the Rust side; for that, run `cargo check` or
`cargo clippy` from `src-tauri/`.

Tests live beside their subject as `*.test.ts` and cover pure front-end logic —
geometry, URL and extension parsing, export-manifest validation, and the board
store's reducers. The Tauri layers (`lib/repo`, `lib/settings`, `@tauri-apps/*`)
are `vi.mock`ed, so no database or Tauri runtime is needed. Drive the store
through `useBoardStore.setState(...)` / `.getState()` rather than mounting
React.

## The shape of the code

```
src/
  components/   canvas, toolbar, notes, modals, title bar
  store/        zustand: boardStore (canvas + undo), themeStore, toastStore
  lib/          db, repo (SQL ⇄ domain types), ingest, images, export/import,
                themes, geometry, updater
  types/        shared domain types
  index.css     theme tokens, chrome styles, hover/press rules
src-tauri/
  src/          Rust commands: images, storage, bundle (export/import)
  migrations/   numbered .sql files, applied in order on DB load
  capabilities/ which plugin APIs the window may call
  tauri.conf.json
```

**Work is split by capability, not by layer.** Rust owns what the WebView
cannot safely do: writing user bytes to disk, downloading remote images past
CORS, and reading or writing paths the user picks. The front end owns the
database — the SQLite connection lives in JS through `tauri-plugin-sql`, and
Rust never touches it. That split is why export/import is a two-sided dance:
JS dumps the rows, Rust embeds the files.

Two rules that bite if missed:

- **Adding a Tauri command** means registering it in the `generate_handler!`
  list in `src-tauri/src/lib.rs`, and usually adding permission in
  `capabilities/default.json`.
- **Changing the schema** means a *new* numbered migration file, registered in
  `lib.rs`. Never edit a migration that has already shipped — someone's
  database has already run it.

Database columns are `snake_case`, app types are `camelCase`, and `lib/repo.ts`
is the only place that knows both. Adding a column touches four things: the
migration, the `*Row` interface, the mapper, and the domain type.

## Conventions

- **No path aliases.** Relative imports throughout.
- **Colours come from theme tokens**, never hard-coded: `var(--text)`,
  `var(--surface)`, `var(--accent)` and friends, defined in `lib/themes.ts` and
  applied to `<html>` by `themeStore`. A hard-coded colour silently breaks five
  of the six themes.
- **Icons** are [lucide-react](https://lucide.dev/), never emoji.
- **IDs** are UUIDs generated in `repo.ts` on create.
- Shared chrome styling lives in `index.css` as `.chrome` / `.chrome-solid`,
  with `.ui-label` / `.ui-mono` for the small monospace labels.

## Platform quirks

These cost real debugging time. They are all Windows/WebView2 specific.

**Tailwind 4 hover is gated behind a media query.** `hover:` compiles to
`@media (hover: hover) { &:hover }`, and a touchscreen laptop reports
`hover: none`, which silently kills every hover style in the app — mouse
included. `index.css` rebinds it with `@custom-variant hover (&:hover)`. For
the same reason, never gate a *feature* on `(pointer: coarse)`; branch on the
gesture (`pointerdown` with `pointerType !== "mouse"`) instead. Tailwind 4 also
drops `cursor: pointer` on buttons, which `index.css` restores.

**Trackpad pinch depends on `zoomHotkeysEnabled: true`.** Chromium reports a
pinch to the page as synthetic Ctrl+wheel events, which `Canvas.tsx` turns into
canvas zoom. Tauri's webview layer sets WebView2's `IsPinchZoomEnabled` from
that window option, and with pinch disabled Windows delivers the gesture as a
two-finger pan instead — so pinch appears to do nothing at all. The same option
arms the browser's own Ctrl+`=`/`-`/`0`, which `Canvas.tsx` intercepts.

**Only one instance can run at a time.** A second copy fails to create its
webview with `0x8007139F` because both want the same WebView2 user-data folder.
If you need the installed app and a dev build side by side, point one at its
own profile with `WEBVIEW2_USER_DATA_FOLDER`.

**The build cannot overwrite a running exe.** `pnpm tauri build` fails with
"Access is denied" while a copy launched from `src-tauri/target/release` is
open. Close it first.

**Viewport restore and pointer capture are timing-sensitive.** Read the canvas
and sticky-note sections of [CLAUDE.md](../CLAUDE.md) before changing either;
both have comments explaining failures that are not obvious from the code.

## Debugging

The release build can be inspected with Chrome DevTools over the DevTools
protocol:

```bash
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9333" ./hirameki.exe
```

Then open `http://127.0.0.1:9333` in a browser. This is how the hover states
and the pinch gesture were verified: forcing `:hover` through the protocol and
diffing computed styles, and recording real wheel events during a gesture.
In `pnpm tauri dev`, right-click → Inspect works directly.

## Releasing

Version lives in three files that must agree: `package.json`,
`src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`. Bump all three, commit,
tag `vX.Y.Z` and push the tag; the release workflow builds, signs and publishes,
and installed apps update themselves on next launch. Full detail, including the
signing key and how to recover if it is lost, is in
[releasing-updates.md](releasing-updates.md).
