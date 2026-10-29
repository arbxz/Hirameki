import { describe, expect, it, vi } from "vitest";

// exportImport.ts pulls in the Tauri dialog + sql layers at import time; stub
// them so the module loads in a plain Node test environment. The functions
// under test here are pure and touch none of them.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./workspaces", () => ({
  listWorkspaces: vi.fn(async () => []),
  uniqueWorkspaceName: (n: string) => n,
}));

const {
  validateManifest,
  exportFileName,
  remapIds,
  scopeOf,
  isLegacyBundle,
  BUNDLE_VERSION,
} = await import("./exportImport");

describe("exportFileName", () => {
  it("names a whole-device bundle for the day it was made", () => {
    expect(exportFileName("all", undefined, new Date(2026, 9, 17))).toBe(
      "hirameki-boards-2026-10-17.json",
    );
  });

  it("zero-pads month and day", () => {
    expect(exportFileName("all", undefined, new Date(2026, 0, 5))).toBe(
      "hirameki-boards-2026-01-05.json",
    );
  });

  it("uses the local day, not UTC", () => {
    // Late enough that UTC has already rolled over in a positive offset.
    expect(exportFileName("all", undefined, new Date(2026, 9, 17, 23, 30))).toBe(
      "hirameki-boards-2026-10-17.json",
    );
  });

  it("names a workspace bundle after the workspace", () => {
    expect(exportFileName("workspace", "Client Work", new Date(2026, 9, 17))).toBe(
      "hirameki-client-work-2026-10-17.json",
    );
  });

  it("survives a workspace name that slugs to nothing", () => {
    // A name of pure punctuation would otherwise produce "hirameki--2026-…".
    expect(exportFileName("workspace", "***", new Date(2026, 9, 17))).toBe(
      "hirameki-workspace-2026-10-17.json",
    );
  });
});

describe("validateManifest", () => {
  it("accepts a well-formed bundle", () => {
    expect(() =>
      validateManifest({
        workspaces: [{ id: "w1", name: "Personal" }],
        boards: [{ id: "b1", workspace_id: "w1", name: "A" }],
        items: [{ id: "i1", board_id: "b1" }],
        settings: [{ workspace_id: "w1", key: "theme.name", value: "Dark" }],
      }),
    ).not.toThrow();
  });

  it("accepts an empty manifest", () => {
    expect(() => validateManifest({})).not.toThrow();
  });

  it("rejects an unknown table", () => {
    expect(() => validateManifest({ passwords: [] })).toThrow(/unknown table/);
  });

  it("rejects an unknown column on the new workspaces table", () => {
    expect(() =>
      validateManifest({ workspaces: [{ id: "w1", owner: "someone" }] }),
    ).toThrow(/unknown column "owner" in workspaces/);
  });

  it("rejects a settings row without its scope column being known", () => {
    expect(() =>
      validateManifest({ settings: [{ key: "k", value: "v", scope: "x" }] }),
    ).toThrow(/unknown column "scope" in settings/);
  });

  it("rejects malformed rows", () => {
    // @ts-expect-error deliberately malformed input
    expect(() => validateManifest({ boards: "nope" })).toThrow(/malformed rows/);
    // @ts-expect-error deliberately malformed input
    expect(() => validateManifest({ boards: [null] })).toThrow(/malformed row/);
  });
});

describe("scopeOf / isLegacyBundle", () => {
  const manifest = { workspaces: [{ id: "w1" }], boards: [] };

  it("reads the scope a current bundle declares", () => {
    expect(scopeOf({ version: BUNDLE_VERSION, scope: "all", manifest: "" })).toBe("all");
    expect(scopeOf({ version: BUNDLE_VERSION, scope: "workspace", manifest: "" })).toBe(
      "workspace",
    );
  });

  it("treats a bundle written before workspaces as a workspace import", () => {
    // It cannot be a device restore any more — its boards have no workspace to
    // belong to — and an old backup must not wipe a machine that has since
    // grown several workspaces.
    const env = { manifest: "" };
    expect(scopeOf(env)).toBe("workspace");
    expect(isLegacyBundle(env, { boards: [] })).toBe(true);
  });

  it("does not call a current bundle legacy", () => {
    expect(
      isLegacyBundle({ version: BUNDLE_VERSION, scope: "all", manifest: "" }, manifest),
    ).toBe(false);
  });

  it("treats a version-2 bundle with no workspaces table as legacy anyway", () => {
    // Belt and braces: the version says new, the contents say old. Trust the
    // contents, because that is what the inserts have to cope with.
    expect(isLegacyBundle({ version: 2, scope: "all", manifest: "" }, { boards: [] })).toBe(
      true,
    );
  });
});

describe("remapIds", () => {
  const bundle = () => ({
    workspaces: [{ id: "w1", name: "Personal", position: 0 }],
    boards: [
      { id: "default", workspace_id: "w1", name: "A", bg_path: "images/bg.png" },
      { id: "b2", workspace_id: "w1", name: "B" },
    ],
    groups: [{ id: "g1", board_id: "default" }],
    items: [
      { id: "i1", board_id: "default", group_id: "g1", file_path: "images/x.png" },
      { id: "i2", board_id: "b2", group_id: null },
    ],
    notes: [{ id: "n1", board_id: "b2", text: "hi" }],
    settings: [
      { workspace_id: "w1", key: "theme.name", value: "Drafting" },
      { workspace_id: "w1", key: "board.activeId", value: "b2" },
    ],
  });

  it("gives every row a new id", () => {
    const out = remapIds(bundle());
    expect(out.workspaces[0].id).not.toBe("w1");
    expect(out.boards[0].id).not.toBe("default");
    expect(out.items[0].id).not.toBe("i1");
    expect(out.notes[0].id).not.toBe("n1");
  });

  it("rewires every foreign key to the new ids", () => {
    const out = remapIds(bundle());
    const ws = out.workspaces[0].id;
    const boardA = out.boards[0].id;
    const boardB = out.boards[1].id;
    const groupA = out.groups[0].id;

    expect(out.boards.every((b) => b.workspace_id === ws)).toBe(true);
    expect(out.groups[0].board_id).toBe(boardA);
    expect(out.items[0].board_id).toBe(boardA);
    expect(out.items[0].group_id).toBe(groupA);
    expect(out.items[1].board_id).toBe(boardB);
    expect(out.notes[0].board_id).toBe(boardB);
    expect(out.settings[0].workspace_id).toBe(ws);
  });

  it("remaps the board id stored as a settings VALUE", () => {
    // board.activeId holds a board id in its value. Left alone, the imported
    // workspace would try to reopen a board that is no longer its own.
    const out = remapIds(bundle());
    const active = out.settings.find((r) => r.key === "board.activeId");
    expect(active?.value).toBe(out.boards[1].id);
    expect(active?.value).not.toBe("b2");
  });

  it("handles the legacy hardcoded \"default\" board id", () => {
    // Bundles written before workspaces contain a board literally called
    // "default". Re-importing one onto the machine it came from would collide
    // on the primary key, which is the whole reason remapping exists.
    const out = remapIds(bundle());
    expect(out.boards.map((b) => b.id)).not.toContain("default");
  });

  it("leaves asset paths alone", () => {
    // Assets are keyed by path in the bundle and restored to the same relative
    // path, so two workspaces referencing one picture share a single file.
    const out = remapIds(bundle());
    expect(out.items[0].file_path).toBe("images/x.png");
    expect(out.boards[0].bg_path).toBe("images/bg.png");
  });

  it("leaves a null foreign key null", () => {
    expect(remapIds(bundle()).items[1].group_id).toBeNull();
  });

  it("does not mutate the manifest it was given", () => {
    const input = bundle();
    remapIds(input);
    expect(input.boards[0].id).toBe("default");
    expect(input.items[0].board_id).toBe("default");
  });
});
