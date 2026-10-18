import { beforeEach, describe, expect, it, vi } from "vitest";

// The connection is a module-level cache, so each test re-imports the module
// with a fresh mock to control what Database.load does.
const load = vi.fn();
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: (...a: unknown[]) => load(...a) } }));

beforeEach(() => {
  load.mockReset();
  vi.resetModules();
});

describe("getDb", () => {
  it("opens the database once and reuses it", async () => {
    const db = { id: "db" };
    load.mockResolvedValue(db);
    const { getDb } = await import("./db");

    await expect(getDb()).resolves.toBe(db);
    await expect(getDb()).resolves.toBe(db);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed load instead of caching the failure", async () => {
    // The file can be locked for a moment — another copy of the app starting,
    // or an import that has just finished writing. Caching that rejection used
    // to leave the window showing an empty board until it was restarted.
    const db = { id: "db" };
    load.mockRejectedValueOnce(new Error("database is locked")).mockResolvedValue(db);
    const { getDb } = await import("./db");

    await expect(getDb()).rejects.toThrow("database is locked");
    await expect(getDb()).resolves.toBe(db);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps retrying while the database stays unavailable", async () => {
    load.mockRejectedValue(new Error("nope"));
    const { getDb } = await import("./db");

    await expect(getDb()).rejects.toThrow("nope");
    await expect(getDb()).rejects.toThrow("nope");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("resetDb drops a good connection too", async () => {
    load.mockResolvedValue({ id: "db" });
    const { getDb, resetDb } = await import("./db");

    await getDb();
    resetDb();
    await getDb();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
