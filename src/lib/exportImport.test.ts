import { describe, expect, it, vi } from "vitest";

// exportImport.ts pulls in the Tauri dialog + sql layers at import time; stub
// them so the module loads in a plain Node test environment. validateManifest
// itself is pure and touches none of them.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("./db", () => ({ getDb: vi.fn() }));

const { validateManifest, exportFileName } = await import("./exportImport");

describe("exportFileName", () => {
  it("names the bundle after the app and the day", () => {
    expect(exportFileName(new Date(2026, 9, 17))).toBe("hirameki-boards-2026-10-17.json");
  });

  it("zero-pads so names sort chronologically", () => {
    expect(exportFileName(new Date(2026, 0, 5))).toBe("hirameki-boards-2026-01-05.json");
  });

  it("uses the local day, not UTC", () => {
    // 23:30 local on the 17th is already the 18th in UTC; the file should
    // still say the 17th, which is the day the user is having.
    expect(exportFileName(new Date(2026, 9, 17, 23, 30))).toBe(
      "hirameki-boards-2026-10-17.json",
    );
  });
});

describe("validateManifest", () => {
  it("accepts a well-formed bundle with known tables and columns", () => {
    expect(() =>
      validateManifest({
        boards: [{ id: "b1", name: "My Board" }],
        items: [{ id: "i1", board_id: "b1", x: 0, y: 0 }],
        settings: [{ key: "theme.name", value: "Dark" }],
      }),
    ).not.toThrow();
  });

  it("accepts an empty manifest", () => {
    expect(() => validateManifest({})).not.toThrow();
  });

  it("rejects an unknown table (a foreign or corrupt bundle)", () => {
    expect(() =>
      validateManifest({ evil_table: [{ id: "x" }] }),
    ).toThrow(/unknown table/);
  });

  it("rejects an unknown column (guards the dynamic INSERT)", () => {
    expect(() =>
      validateManifest({ boards: [{ id: "b1", drop_table: "boards" }] }),
    ).toThrow(/unknown column/);
  });

  it("rejects non-array rows", () => {
    expect(() =>
      // @ts-expect-error deliberately malformed input
      validateManifest({ boards: { id: "b1" } }),
    ).toThrow(/malformed rows/);
  });

  it("rejects a null row", () => {
    expect(() =>
      // @ts-expect-error deliberately malformed input
      validateManifest({ items: [null] }),
    ).toThrow(/malformed row/);
  });
});
