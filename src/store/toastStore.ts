import { create } from "zustand";
import { v4 as uuid } from "uuid";

// Transient notification layer. Replaces the old permanent error bar in App.tsx
// and doubles as the surface for undo prompts ("Deleted 3 images — Undo"),
// in-flight progress ("Adding 3 images…"), and export confirmations.
//
// Kept separate from boardStore so anything can raise a toast without pulling in
// the board state, and so a toast can outlive the action that raised it.

export type ToastKind = "info" | "success" | "error" | "progress";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  /** Optional single action, e.g. Undo. Running it dismisses the toast. */
  action?: ToastAction;
  /** ms until auto-dismiss, or null to stay until dismissed explicitly. */
  duration: number | null;
}

// A toast carrying an action needs long enough to read and reach for it; errors
// linger longer than confirmations. `progress` toasts are updated in place by
// the caller and so never expire on their own.
const DEFAULT_DURATION: Record<ToastKind, number | null> = {
  info: 5000,
  success: 4000,
  error: 9000,
  progress: null,
};
const ACTION_DURATION = 9000;

/** Most recent first; the Toaster renders them bottom-up. */
const MAX_VISIBLE = 4;

type PushInput = Omit<Partial<Toast>, "id"> & Pick<Toast, "message">;

interface ToastState {
  toasts: Toast[];
  /** Show a toast; returns its id so the caller can update or dismiss it. */
  push: (toast: PushInput) => string;
  /** Patch an existing toast in place (progress → result). No-op if gone. */
  update: (id: string, patch: Omit<Partial<Toast>, "id">) => void;
  dismiss: (id: string) => void;
  /** Hold a toast open while the pointer or focus is on it. */
  pause: (id: string) => void;
  /** Restart its full auto-dismiss countdown. */
  resume: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set, get) => {
  // Auto-dismiss timers, keyed by toast id. Kept outside React state so
  // re-rendering never re-arms them.
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const clearTimer = (id: string) => {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.delete(id);
  };

  const armTimer = (id: string, duration: number | null) => {
    clearTimer(id);
    if (duration === null) return;
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        get().dismiss(id);
      }, duration),
    );
  };

  return {
    toasts: [],

    push(input) {
      const id = uuid();
      const kind = input.kind ?? "info";
      const duration =
        input.duration !== undefined
          ? input.duration
          : input.action
            ? ACTION_DURATION
            : DEFAULT_DURATION[kind];
      const toast: Toast = {
        id,
        kind,
        message: input.message,
        action: input.action,
        duration,
      };
      set({ toasts: [...get().toasts, toast].slice(-MAX_VISIBLE) });
      armTimer(id, duration);
      return id;
    },

    update(id, patch) {
      const existing = get().toasts.find((t) => t.id === id);
      if (!existing) return;
      const next: Toast = { ...existing, ...patch };
      // An explicit duration in the patch re-arms; otherwise, a kind change
      // adopts that kind's default (so progress → success expires normally).
      const duration =
        patch.duration !== undefined
          ? patch.duration
          : patch.kind && patch.kind !== existing.kind
            ? next.action
              ? ACTION_DURATION
              : DEFAULT_DURATION[patch.kind]
            : existing.duration;
      next.duration = duration;
      set({ toasts: get().toasts.map((t) => (t.id === id ? next : t)) });
      armTimer(id, duration);
    },

    dismiss(id) {
      clearTimer(id);
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },

    // An Undo toast that expires while the cursor is travelling to its button
    // takes the only undo affordance with it (WCAG 2.2.1, timing adjustable).
    pause(id) {
      clearTimer(id);
    },

    resume(id) {
      const t = get().toasts.find((x) => x.id === id);
      if (t) armTimer(id, t.duration);
    },

    clear() {
      for (const id of [...timers.keys()]) clearTimer(id);
      set({ toasts: [] });
    },
  };
});

// Convenience wrappers for the common cases.
export const toast = {
  info: (message: string, action?: ToastAction) =>
    useToastStore.getState().push({ message, kind: "info", action }),
  success: (message: string, action?: ToastAction) =>
    useToastStore.getState().push({ message, kind: "success", action }),
  error: (message: string) =>
    useToastStore.getState().push({ message, kind: "error" }),
  progress: (message: string) =>
    useToastStore.getState().push({ message, kind: "progress" }),
};
