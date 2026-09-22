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

/** Outcome of a batch. Partial success is normal: one bad URL in a drop of
 *  twenty shouldn't cost the other nineteen. */
export interface IngestResult {
  added: number;
  failed: number;
  /** Message from the first failure, for reporting. */
  error?: string;
}

/** Progress ticks so the caller can show "Adding 3 of 12…". */
export type OnProgress = (done: number, total: number) => void;

// Each successive item in a multi-drop is nudged so they don't stack exactly.
const CASCADE = 28;

// How many images to process at once. Enough to overlap network latency on a
// multi-URL drop, low enough that several large files aren't held in memory as
// IPC payloads simultaneously.
const CONCURRENCY = 3;

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

/**
 * Run `task` over every entry with a bounded number in flight, collecting
 * failures instead of rejecting on the first one. Each task keeps its original
 * index so cascade offsets stay deterministic regardless of completion order.
 */
async function runBatch<T>(
  entries: T[],
  task: (entry: T, index: number) => Promise<void>,
  onProgress?: OnProgress,
): Promise<IngestResult> {
  const total = entries.length;
  let added = 0;
  let failed = 0;
  let error: string | undefined;
  let next = 0;

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= total) return;
      try {
        await task(entries[i], i);
        added++;
      } catch (e) {
        failed++;
        error ??= String(e);
      }
      onProgress?.(added + failed, total);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, total) }, worker),
  );
  return { added, failed, error };
}

/** Ingest a list of files (from drop, paste, or the upload picker). */
export async function ingestFiles(
  files: File[],
  at: World,
  addItem: AddItem,
  onProgress?: OnProgress,
): Promise<IngestResult> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  return runBatch(
    images,
    (file, i) =>
      ingestFile(file, { x: at.x + i * CASCADE, y: at.y + i * CASCADE }, addItem),
    onProgress,
  );
}

/**
 * Ingest a browser DataTransfer (from a drop or paste). Prefers real files;
 * otherwise falls back to a dragged/pasted image URL.
 */
export async function ingestDataTransfer(
  dt: DataTransfer,
  at: World,
  addItem: AddItem,
  onProgress?: OnProgress,
): Promise<IngestResult> {
  const files = Array.from(dt.files);
  if (files.some((f) => f.type.startsWith("image/"))) {
    return ingestFiles(files, at, addItem, onProgress);
  }

  // Dragged image links arrive as uri-list or plain text.
  const uri = dt.getData("text/uri-list") || dt.getData("text/plain") || "";
  const candidate = uri.split(/\s+/).find(looksLikeUrl);
  if (candidate) {
    return runBatch(
      [candidate],
      (url) => ingestUrl(url, at, addItem),
      onProgress,
    );
  }
  return { added: 0, failed: 0 };
}
