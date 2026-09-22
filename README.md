<p align="center">
  <img src="src-tauri/icons/128x128.png" width="120" alt="Hirameki app icon" />
</p>

<h1 align="center">Hirameki</h1>

<p align="center">
  A visual inspiration mood board — an infinite canvas for collecting images,
  arranging ideas, and setting the mood.
</p>

---

## What it is

Hirameki is a desktop mood-board app. Drop images onto an infinite, zoomable
canvas, arrange and resize them freely, and organize everything across multiple
boards — all stored locally on your machine.

## Features

- **Infinite canvas** — pan and zoom across a boundless workspace with a dot grid.
- **Drop anything** — drag-and-drop, paste, upload, or paste image links; remote
  images are downloaded and stored locally.
- **Free-form arrangement** — move, resize, and multi-select items.
- **Multiple boards** — tabs with customizable color tags, reorderable tabs, and
  a fixed per-board background image.
- **Themes** — built-in presets plus a custom color editor.
- **Export / import** — bundle every image and sound from a board into a single
  file to back up or move between machines.
- **Custom title bar** — frameless window with its own controls.
- **Auto-updates** — signed self-updater delivered via GitHub Releases.

## Tech stack

- [Tauri 2](https://tauri.app/) (Rust) — native desktop shell
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite 7](https://vite.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/) for styling
- [Zustand](https://github.com/pmndrs/zustand) for state
- SQLite via [`tauri-plugin-sql`](https://github.com/tauri-apps/plugins-workspace) for local storage
- [react-infinite-viewer](https://github.com/daybrush/infinite-viewer),
  [react-moveable](https://github.com/daybrush/moveable), and
  [react-selecto](https://github.com/daybrush/selecto) for the canvas

## Getting started

Prerequisites: [Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/), and the
[Rust toolchain](https://www.rust-lang.org/tools/install) with the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
pnpm install        # install dependencies
pnpm tauri dev      # run the app in development
pnpm tauri build    # build a production installer
```

> **Note:** production builds are signed for the auto-updater, so `pnpm tauri build`
> needs the signing key in the environment. See
> [docs/releasing-updates.md](docs/releasing-updates.md).

## Documentation

- [Changing the app icon](docs/changing-the-app-icon.md) — regenerating icons and
  clearing the Windows icon cache.
- [Releasing updates](docs/releasing-updates.md) — signing keys, the release flow,
  and the GitHub Releases pipeline.
