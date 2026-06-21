# Changing the App Icon (Hirameki / Tauri)

How to change the Windows app icon, plus the gotchas that make a "changed" icon
keep showing the old one.

## TL;DR

```powershell
# 1. Regenerate all icon files from one square source PNG (>=1024x1024)
pnpm tauri icon src-tauri/app-icon.png

# 2. FORCE a clean rebuild so the new icon is actually re-embedded
cd src-tauri; cargo clean -p hirameki --release; cd ..
pnpm tauri build

# 3. Reinstall (replaces the old-icon copy on disk)
#    src-tauri/target/release/bundle/nsis/Hirameki_0.1.0_x64-setup.exe

# 4. Clear the Windows icon cache, then re-pin to taskbar (see below)
```

## Full procedure

### 1. Generate the icons
Tauri generates every required size/format from a single source image.

- Source: square PNG, **≥ 1024×1024**, ideally transparent.
- Run: `pnpm tauri icon <path-to-source.png>`
- This overwrites everything in [`src-tauri/icons/`](../src-tauri/icons/): `icon.ico`
  (Windows), `icon.icns` (macOS), the PNGs, and the Store `SquareXXX` logos.
- No config change needed — [`tauri.conf.json`](../src-tauri/tauri.conf.json)
  already references these filenames under `bundle.icon`.

### 2. Rebuild — and force it
The Windows app icon is **compiled into the `.exe`** by a build script, *not*
read at runtime. A plain `pnpm tauri build` is **not always enough**: Cargo
caches the compiled icon resource, so the binary re-links the *old* icon even
though `icon.ico` changed.

Always force the resource to regenerate:

```powershell
cd src-tauri; cargo clean -p hirameki --release; cd ..
pnpm tauri build
```

Outputs:
- `src-tauri/target/release/hirameki.exe` — standalone app
- `src-tauri/target/release/bundle/nsis/Hirameki_0.1.0_x64-setup.exe` — installer
- `src-tauri/target/release/bundle/msi/Hirameki_0.1.0_x64_en-US.msi` — installer

### 3. Reinstall
Building does **not** update an already-installed copy
(`%LOCALAPPDATA%\Hirameki\hirameki.exe`). Run the new `-setup.exe` (or uninstall
first via Settings → Apps), otherwise your shortcut keeps launching the old exe.

### 4. Clear the Windows icon cache + re-pin
Windows caches taskbar/shortcut icons aggressively. Pinned taskbar items keep a
private copy, so **unpin first**, then clear the cache:

```powershell
# Unpin the taskbar icon BEFORE running this.
taskkill /IM explorer.exe /F
Remove-Item "$env:LOCALAPPDATA\IconCache.db" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\Microsoft\Windows\Explorer\iconcache*" -Force -ErrorAction SilentlyContinue
Start-Process explorer.exe
```

Then launch from the Start menu and re-pin to taskbar.

## Symptoms → cause cheat sheet

| Symptom | Cause | Fix |
|---|---|---|
| Window title bar = new, taskbar/shortcut = old | Exe embeds old icon (cached resource) **or** shortcut points at old installed exe | Clean rebuild (step 2) + reinstall (step 3) |
| Uninstall menu = new, taskbar = old | Installed exe is fine; only the icon cache/pinned item is stale | Clear cache + unpin/re-pin (step 4) |
| Nothing changed at all | `tauri icon` not run, or old source image | Re-run step 1 with the correct source |

## How to verify what's actually embedded

Extract the icon straight out of an exe (bypasses the shell cache):

```powershell
Add-Type -AssemblyName System.Drawing
$ico = [System.Drawing.Icon]::ExtractAssociatedIcon("path\to\hirameki.exe")
$ico.ToBitmap().Save("$env:TEMP\check.png")
# open %TEMP%\check.png
```

If `check.png` shows the old icon, the binary itself is stale — rebuild
(step 2). If it shows the new icon but the taskbar doesn't, it's a cache/pin or
reinstall issue (steps 3–4).

> Note: `System.Drawing` can't render PNG-compressed `.ico` frames (shows color
> noise). To inspect `icon.ico` itself, dump a frame by parsing the ICO
> directory rather than relying on `Icon.ToBitmap()`.
