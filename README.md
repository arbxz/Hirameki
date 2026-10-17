<p align="center">
  <img src="src-tauri/icons/128x128.png" width="120" alt="Hirameki app icon" />
</p>

<h1 align="center">Hirameki</h1>

<p align="center">
  <em>Hirameki (ひらめき) — a flash of inspiration.</em>
</p>

<p align="center">
  An infinite canvas for collecting images, arranging ideas, and setting the
  mood. Everything stays on your machine.
</p>

<p align="center">
  <a href="https://github.com/arbxz/hirameki/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/arbxz/hirameki?label=download" /></a>
  <img alt="Platform: Windows" src="https://img.shields.io/badge/platform-Windows-blue" />
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-green" /></a>
</p>

---

## What it is

A desktop mood board. Drop images onto a canvas that never runs out of room,
arrange them until the collection says something, and keep separate boards for
separate ideas. It is a scrapbook, not a cloud service: no account, no sync, no
telemetry.

## Install

Download the latest `Hirameki_x.y.z_x64-setup.exe` from
[Releases](https://github.com/arbxz/hirameki/releases/latest) and run it.
Windows only, 64-bit.

Windows SmartScreen will warn that the publisher is unknown, because the
installer is not code-signed — click **More info → Run anyway**, or check the
file's hash against the release notes if you prefer. Updates after that are
[signed and verified](docs/releasing-updates.md) by the app itself.

## Features

**The canvas**
- Pan and zoom an endless dot grid — space-drag, middle-drag, Ctrl+scroll,
  trackpad pinch, or zoom to fit (`Shift`+`1`) and to selection (`Shift`+`2`).
- Drop, paste, upload, or paste a link to an image; remote images are
  downloaded and stored locally, so a board survives the original going away.
- Move, resize, rotate and marquee-select. Items snap to their neighbours'
  edges and centres; `Shift` frees the aspect ratio and snaps rotation to 15°.
- Arrow keys nudge the selection 1px, or 10px with `Shift`, so a layout can be
  finished without the mouse.
- Group items, reorder front to back, and select everything with `Ctrl`+`A`.

**Boards and notes**
- Tabs for as many boards as you like, each with a colour tag, its own saved
  pan and zoom, and an optional fixed background image or GIF.
- Sticky notes with their own palette, frosted or solid backgrounds, and text
  that scales with the canvas.

**Everything else**
- Undo and redo for every canvas action, with an undo button on the toast that
  reports it.
- Themes: Dark, Light, Sepia, Paper, Midnight and Forest, plus a custom colour
  editor. Every colour in the UI is a theme token.
- Export a board — images and all — into one file, and import it on another
  machine.
- Press `?` for the full keyboard reference.
- Signed auto-updates: the app checks on launch and installs in place.

## Your data

Boards live in a local SQLite database and images are copied into the app's own
folder. Nothing is uploaded anywhere.

| What | Where (Windows) |
| --- | --- |
| Boards, notes, settings | `%APPDATA%\com.arbxz.hirameki\inspo.db` |
| Imported images | `%APPDATA%\com.arbxz.hirameki\images\` |

The app makes exactly two kinds of network request: downloading an image URL
you paste, and asking GitHub whether a newer release exists. Uninstalling
leaves that folder in place; delete it by hand to remove your boards.

## Built with

[Tauri 2](https://tauri.app/) (Rust shell) · [React 19](https://react.dev/) +
[TypeScript](https://www.typescriptlang.org/) + [Vite 7](https://vite.dev/) ·
[Tailwind CSS 4](https://tailwindcss.com/) · [Zustand](https://github.com/pmndrs/zustand) ·
SQLite through [`tauri-plugin-sql`](https://github.com/tauri-apps/plugins-workspace) ·
[infinite-viewer](https://github.com/daybrush/infinite-viewer),
[moveable](https://github.com/daybrush/moveable) and
[selecto](https://github.com/daybrush/selecto) for the canvas.

## Building it yourself

```bash
pnpm install        # dependencies
pnpm tauri dev      # run the app
pnpm tauri build    # production installer
```

Needs Node with [pnpm](https://pnpm.io/) and the
[Rust toolchain](https://www.rust-lang.org/tools/install) with
[Tauri's prerequisites](https://tauri.app/start/prerequisites/). `pnpm tauri
build` also wants the updater signing key in the environment — see
[docs/development.md](docs/development.md) to get set up, and
[docs/releasing-updates.md](docs/releasing-updates.md) for why.

## Documentation

- [Development guide](docs/development.md) — setup, architecture, testing, and
  the platform quirks worth knowing before you touch the canvas.
- [Releasing updates](docs/releasing-updates.md) — signing keys and the
  tag-triggered release pipeline.
- [Changing the app icon](docs/changing-the-app-icon.md) — regenerating icons
  and clearing the Windows icon cache.

## Licence

[MIT](LICENSE) © Arbaaz Mowlabucus
