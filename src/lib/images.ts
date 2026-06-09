import { invoke } from "@tauri-apps/api/core";
import { extFromName, resolveAssetSrc } from "./assets";

// Frontend half of image ingestion. The Rust commands (save_image /
// download_image) own writing bytes and downloading URLs; this module handles
// extracting bytes from browser File/drop/paste objects, measuring dimensions,
// and resolving stored relative paths back into asset URLs for <img>.

export { looksLikeUrl } from "./assets";

/** Longest-edge size (world units at zoom 1) for a freshly added image. */
export const DEFAULT_MAX_DIM = 360;

/** Resolve a stored relative path ("images/x.png") to an <img>-usable URL. */
export const resolveImageSrc = resolveAssetSrc;

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/avif": "avif",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
  };
  return map[mime] ?? "";
}

/** Persist a browser File/Blob via the Rust command; returns the relative path. */
export async function saveFile(file: File | Blob): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const name = "name" in file ? (file as File).name : "";
  const ext = extFromName(name) || extFromMime(file.type) || "png";
  return invoke<string>("save_image", { bytes: Array.from(buf), ext });
}

/** Download + persist a remote image URL via Rust; returns the relative path. */
export function downloadUrl(url: string): Promise<string> {
  return invoke<string>("download_image", { url });
}

/** Measure an image's natural pixel dimensions from any <img>-loadable src. */
export function measure(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error("could not decode image"));
    img.src = src;
  });
}

/** Scale natural dimensions down to DEFAULT_MAX_DIM on the longest edge. */
export function fitDimensions(
  w: number,
  h: number,
  maxDim = DEFAULT_MAX_DIM,
): { width: number; height: number } {
  const scale = Math.min(1, maxDim / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}
