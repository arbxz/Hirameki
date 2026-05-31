import type { Item } from "../types/board";
import {
  downloadUrl,
  fitDimensions,
  looksLikeUrl,
  measure,
  resolveImageSrc,
  saveFile,
} from "./images";

// Orchestrates turning a drop / paste / upload into persisted board items.
// Geometry is computed in world coordinates; the caller supplies the drop point
// and the store's addItem.

export type AddItem = (
  partial: Partial<Item> & Pick<Item, "x" | "y" | "width" | "height">,
) => Promise<Item | null>;

interface World {
  x: number;
  y: number;
}

// Each successive item in a multi-drop is nudged so they don't stack exactly.
const CASCADE = 28;

async function ingestFile(file: File, at: World, addItem: AddItem): Promise<void> {
  // Measure from an object URL before persisting so the item gets correct
  // aspect ratio immediately (no post-load resize flicker).
  const objUrl = URL.createObjectURL(file);
  let dims: { w: number; h: number };
  try {
    dims = await measure(objUrl);
  } finally {
    URL.revokeObjectURL(objUrl);
  }
  const path = await saveFile(file);
  const { width, height } = fitDimensions(dims.w, dims.h);
  await addItem({
    x: at.x - width / 2,
    y: at.y - height / 2,
    width,
    height,
    filePath: path,
    naturalW: dims.w,
    naturalH: dims.h,
  });
}

async function ingestUrl(url: string, at: World, addItem: AddItem): Promise<void> {
  const path = await downloadUrl(url);
  const src = await resolveImageSrc(path);
  const dims = await measure(src);
  const { width, height } = fitDimensions(dims.w, dims.h);
  await addItem({
    x: at.x - width / 2,
    y: at.y - height / 2,
    width,
    height,
    filePath: path,
    srcUrl: url,
    naturalW: dims.w,
    naturalH: dims.h,
  });
}

/** Ingest a list of files (from drop, paste, or the upload picker). */
export async function ingestFiles(
  files: File[],
  at: World,
  addItem: AddItem,
): Promise<void> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  for (let i = 0; i < images.length; i++) {
    const offset = i * CASCADE;
    await ingestFile(
      images[i],
      { x: at.x + offset, y: at.y + offset },
      addItem,
    );
  }
}

/**
 * Ingest a browser DataTransfer (from a drop or paste). Prefers real files;
 * otherwise falls back to a dragged/pasted image URL. Returns true if anything
 * was ingested.
 */
export async function ingestDataTransfer(
  dt: DataTransfer,
  at: World,
  addItem: AddItem,
): Promise<boolean> {
  const files = Array.from(dt.files);
  if (files.some((f) => f.type.startsWith("image/"))) {
    await ingestFiles(files, at, addItem);
    return true;
  }

  // Dragged image links arrive as uri-list or plain text.
  const uri =
    dt.getData("text/uri-list") || dt.getData("text/plain") || "";
  const candidate = uri.split(/\s+/).find(looksLikeUrl);
  if (candidate) {
    await ingestUrl(candidate, at, addItem);
    return true;
  }
  return false;
}
