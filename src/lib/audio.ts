import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";

// Frontend half of audio ingestion (mirrors lib/images.ts). The Rust command
// save_audio writes bytes to the app audio dir; this resolves stored relative
// paths back into asset URLs for the <audio> element, and extracts bytes from
// picked files.

let appDataDirPromise: Promise<string> | null = null;
function getAppDataDir(): Promise<string> {
  if (!appDataDirPromise) appDataDirPromise = appDataDir();
  return appDataDirPromise;
}

/** Resolve a stored relative path ("audio/x.mp3") to an <audio>-usable URL. */
export async function resolveAudioSrc(relPath: string): Promise<string> {
  const abs = await join(await getAppDataDir(), relPath);
  return convertFileSrc(abs);
}

function extFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1) : "";
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/aac": "aac",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/webm": "webm",
  };
  return map[mime] ?? "";
}

/** Persist a browser audio File via Rust; returns the relative path. */
export async function saveAudioFile(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const ext = extFromName(file.name) || extFromMime(file.type) || "mp3";
  return invoke<string>("save_audio", { bytes: Array.from(buf), ext });
}

const URL_RE = /^https?:\/\/\S+$/i;
export function looksLikeUrl(text: string): boolean {
  return URL_RE.test(text.trim());
}
