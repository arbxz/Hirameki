import { beforeEach, describe, expect, it, vi } from "vitest";

// ingest.ts drives the Rust-backed save/download commands through ./images;
// mock that boundary so the batching logic runs with no Tauri runtime.
vi.mock("./images", () => ({
  saveFile: vi.fn(async (file: File) => {
    if (file.name === "bad.png") throw new Error("disk full");
    return `images/${file.name}`;
  }),
  downloadUrl: vi.fn(async (url: string) => {
    if (url.includes("bad")) throw new Error("404");
    return "images/downloaded.png";
  }),
  resolveImageSrc: vi.fn(async (p: string) => p),
  measure: vi.fn(async () => ({ w: 200, h: 100 })),
  fitDimensions: (w: number, h: number) => ({ width: w, height: h }),
  looksLikeUrl: (s: string) => s.startsWith("http"),
}));

const { ingestFiles, ingestDataTransfer } = await import("./ingest");

// ingestFile measures from an object URL, which jsdom-less Node doesn't provide.
beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => "blob:stub");
  globalThis.URL.revokeObjectURL = vi.fn();
});

const file = (name: string): File =>
  ({ name, type: "image/png" }) as unknown as File;

/** Collects what the store would have persisted. */
function recorder() {
  const added: { x: number; y: number }[] = [];
  const addItem = vi.fn(async (partial: { x: number; y: number }) => {
    added.push({ x: partial.x, y: partial.y });
    return null;
  });
  return { added, addItem: addItem as never };
}

describe("ingestFiles", () => {
  it("adds every image in the batch", async () => {
    const { added, addItem } = recorder();
    const result = await ingestFiles(
      [file("a.png"), file("b.png"), file("c.png")],
      { x: 0, y: 0 },
      addItem,
    );
    expect(result).toMatchObject({ added: 3, failed: 0 });
    expect(added).toHaveLength(3);
  });

  it("keeps going when one image fails, and reports the failure", async () => {
    const { added, addItem } = recorder();
    const result = await ingestFiles(
      [file("a.png"), file("bad.png"), file("c.png")],
      { x: 0, y: 0 },
      addItem,
    );
    // The bad file must not cost the good ones — the old serial loop threw out
    // of the batch and silently dropped everything after the failure.
    expect(result.added).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.error).toContain("disk full");
    expect(added).toHaveLength(2);
  });

  it("cascades each image by its index so positions stay deterministic", async () => {
    const { added, addItem } = recorder();
    await ingestFiles(
      [file("a.png"), file("b.png")],
      { x: 1000, y: 1000 },
      addItem,
    );
    // Centred on the drop point (200x100 image → -100/-50), then cascaded 28px.
    const xs = added.map((a) => a.x).sort((a, b) => a - b);
    expect(xs).toEqual([900, 928]);
  });

  it("ignores non-image files", async () => {
    const { addItem } = recorder();
    const result = await ingestFiles(
      [{ name: "notes.txt", type: "text/plain" } as unknown as File],
      { x: 0, y: 0 },
      addItem,
    );
    expect(result).toMatchObject({ added: 0, failed: 0 });
  });

  it("reports progress as the batch advances", async () => {
    const { addItem } = recorder();
    const ticks: [number, number][] = [];
    await ingestFiles(
      [file("a.png"), file("b.png")],
      { x: 0, y: 0 },
      addItem,
      (done, total) => ticks.push([done, total]),
    );
    expect(ticks).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});

describe("ingestDataTransfer", () => {
  const transfer = (files: File[], text = ""): DataTransfer =>
    ({ files, getData: (type: string) => (type === "text/plain" ? text : "") }) as unknown as DataTransfer;

  it("prefers real image files over a dragged URL", async () => {
    const { addItem } = recorder();
    const result = await ingestDataTransfer(
      transfer([file("a.png")], "http://example.com/x.png"),
      { x: 0, y: 0 },
      addItem,
    );
    expect(result).toMatchObject({ added: 1, failed: 0 });
  });

  it("falls back to a pasted image URL", async () => {
    const { addItem } = recorder();
    const result = await ingestDataTransfer(
      transfer([], "http://example.com/x.png"),
      { x: 0, y: 0 },
      addItem,
    );
    expect(result).toMatchObject({ added: 1, failed: 0 });
  });

  it("reports a failed download instead of throwing out of the batch", async () => {
    const { addItem } = recorder();
    const result = await ingestDataTransfer(
      transfer([], "http://example.com/bad.png"),
      { x: 0, y: 0 },
      addItem,
    );
    expect(result.added).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.error).toContain("404");
  });

  it("does nothing when there's neither an image nor a URL", async () => {
    const { addItem } = recorder();
    const result = await ingestDataTransfer(
      transfer([], "just some text"),
      { x: 0, y: 0 },
      addItem,
    );
    expect(result).toMatchObject({ added: 0, failed: 0 });
  });
});
