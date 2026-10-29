import { describe, expect, it, vi } from "vitest";

// workspaces.ts reaches the DB at import time through ./db; stub it so the pure
// helpers can be exercised in a plain Node environment.
vi.mock("./db", () => ({ getDb: vi.fn() }));

const { resolveLaunchWorkspace, uniqueWorkspaceName } = await import("./workspaces");

const ws = (...ids: string[]) => ids.map((id) => ({ id }));

describe("resolveLaunchWorkspace", () => {
  it("opens the last one used when 'load last' is on", () => {
    expect(
      resolveLaunchWorkspace({
        workspaces: ws("a", "b", "c"),
        loadLast: true,
        lastId: "b",
        defaultId: "c",
      }),
    ).toBe("b");
  });

  it("opens the one marked default when 'load last' is off", () => {
    expect(
      resolveLaunchWorkspace({
        workspaces: ws("a", "b", "c"),
        loadLast: false,
        lastId: "b",
        defaultId: "c",
      }),
    ).toBe("c");
  });

  it("falls back to the first when the remembered one is gone", () => {
    // Deleted on another run. Launching must not strand the app on an id that
    // no longer resolves to anything.
    expect(
      resolveLaunchWorkspace({
        workspaces: ws("a", "b"),
        loadLast: true,
        lastId: "deleted",
        defaultId: null,
      }),
    ).toBe("a");
  });

  it("falls back to the first when no default has been set", () => {
    expect(
      resolveLaunchWorkspace({
        workspaces: ws("a", "b"),
        loadLast: false,
        lastId: "b",
        defaultId: null,
      }),
    ).toBe("a");
  });

  it("returns null only when there are no workspaces at all", () => {
    expect(
      resolveLaunchWorkspace({
        workspaces: [],
        loadLast: true,
        lastId: "a",
        defaultId: "a",
      }),
    ).toBeNull();
  });
});

describe("uniqueWorkspaceName", () => {
  it("keeps a name that doesn't collide", () => {
    expect(uniqueWorkspaceName("Personal", ["Work"])).toBe("Personal");
  });

  it("numbers a collision", () => {
    expect(uniqueWorkspaceName("Personal", ["Personal"])).toBe("Personal (2)");
  });

  it("keeps counting past an existing numbered copy", () => {
    // Importing the same bundle three times should give (2) then (3), not two
    // workspaces both called "Personal (2)".
    expect(
      uniqueWorkspaceName("Personal", ["Personal", "Personal (2)"]),
    ).toBe("Personal (3)");
  });
});
