import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";

// Shared frontend helpers for stored binary assets (images + audio). The Rust
// commands own writing bytes; this resolves stored relative paths back into
// asset URLs and holds the small bits both lib/images.ts and lib/audio.ts need.

// appDataDir is stable for the process; resolve it once.
let appDataDirPromise: Promise<string> | null = null;
function getAppDataDir(): Promise<string> {
  if (!appDataDirPromise) appDataDirPromise = appDataDir();
  return appDataDirPromise;
}

/** Resolve a stored relative path ("images/x.png") to an asset-protocol URL. */
export async function resolveAssetSrc(relPath: string): Promise<string> {
  const abs = await join(await getAppDataDir(), relPath);
  return convertFileSrc(abs);
}

/** Extension (without the dot) from a filename, or "" if none. */
export function extFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1) : "";
}

const URL_RE = /^https?:\/\/\S+$/i;

/** True if a string looks like an http(s) URL we can fetch. */
export function looksLikeUrl(text: string): boolean {
  return URL_RE.test(text.trim());
}
