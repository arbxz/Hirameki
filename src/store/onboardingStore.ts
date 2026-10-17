import { create } from "zustand";
import { getSetting, setSetting } from "../lib/settings";
import {
  clampStep,
  isLastStep,
  shouldAutoStart,
  TOUR_SEEN_KEY,
  TOUR_VERSION,
} from "../lib/onboarding";

// Whether the first-run tour is showing, and which step. Kept apart from the
// board store: the tour is about the window, not the canvas, and it must be
// able to open before any board has finished loading.

// StrictMode mounts effects twice in dev; only read the setting once.
let initStarted = false;

interface OnboardingState {
  open: boolean;
  step: number;
  /** Read the stored flag and open the tour if this user hasn't seen it. */
  init: () => Promise<void>;
  /** Open it from the Settings panel, from the top. */
  start: () => void;
  next: () => void;
  back: () => void;
  /** Close and remember, whether the user finished or skipped. */
  dismiss: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  open: false,
  step: 0,

  async init() {
    if (initStarted) return;
    initStarted = true;
    try {
      const seen = await getSetting(TOUR_SEEN_KEY);
      if (shouldAutoStart(seen)) set({ open: true, step: 0 });
    } catch {
      // A tour is not worth a toast. If the settings table can't be read the
      // app has louder problems, and staying quiet beats nagging on launch.
    }
  },

  start() {
    set({ open: true, step: 0 });
  },

  next() {
    const { step } = get();
    if (isLastStep(step)) {
      get().dismiss();
      return;
    }
    set({ step: clampStep(step + 1) });
  },

  back() {
    set({ step: clampStep(get().step - 1) });
  },

  dismiss() {
    set({ open: false, step: 0 });
    // Fire and forget: the tour is closed either way, and a failed write only
    // means it shows again next launch.
    void setSetting(TOUR_SEEN_KEY, TOUR_VERSION).catch(() => {});
  },
}));
