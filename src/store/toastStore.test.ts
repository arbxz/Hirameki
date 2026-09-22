import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToastStore } from "./toastStore";

const ids = () => useToastStore.getState().toasts.map((t) => t.id);

describe("toastStore auto-dismiss", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    useToastStore.getState().clear();
    vi.useRealTimers();
  });

  it("dismisses after the kind's default duration", () => {
    const id = useToastStore.getState().push({ message: "hi", kind: "info" });
    vi.advanceTimersByTime(4999);
    expect(ids()).toContain(id);
    vi.advanceTimersByTime(1);
    expect(ids()).not.toContain(id);
  });

  it("stays open while paused, however long", () => {
    const id = useToastStore.getState().push({ message: "hi", kind: "info" });
    useToastStore.getState().pause(id);
    vi.advanceTimersByTime(60_000);
    expect(ids()).toContain(id);
  });

  it("restarts the full countdown on resume", () => {
    const id = useToastStore.getState().push({
      message: "Deleted 1 image",
      action: { label: "Undo", run: () => {} },
    });
    vi.advanceTimersByTime(8000); // 1s left of the 9s action duration
    useToastStore.getState().pause(id);
    useToastStore.getState().resume(id);
    vi.advanceTimersByTime(8999);
    expect(ids()).toContain(id);
    vi.advanceTimersByTime(1);
    expect(ids()).not.toContain(id);
  });

  it("never arms a timer for progress toasts, even on resume", () => {
    const id = useToastStore.getState().push({ message: "…", kind: "progress" });
    useToastStore.getState().resume(id);
    vi.advanceTimersByTime(60_000);
    expect(ids()).toContain(id);
  });
});
