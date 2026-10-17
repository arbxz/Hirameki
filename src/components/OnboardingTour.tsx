import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOnboardingStore } from "../store/onboardingStore";
import { isLastStep, TOUR_STEPS, type Placement } from "../lib/onboarding";

// The first-run tour. A dimmed overlay with a hole cut around the element the
// current step is about, and a card beside it.
//
// The hole is one element with a very large box-shadow spread rather than four
// masking divs: it stays exactly aligned while the window resizes, and the
// dimming is a single paint. A separate layer underneath swallows clicks, so
// the app can't be half-operated through the dim.

const PAD = 6; // breathing room between the spotlight and its target
const GAP = 12; // between the spotlight and the card
const CARD_W = 320;
const MARGIN = 12; // keep the card this far from the window edge

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function rectOf(anchor: string | undefined): Rect | null {
  if (!anchor) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

/** Card position for a spotlight, clamped so it never leaves the window. */
function cardPosition(rect: Rect | null, placement: Placement, cardH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect || placement === "center") {
    return { top: Math.max(MARGIN, vh / 2 - cardH / 2), left: Math.max(MARGIN, vw / 2 - CARD_W / 2) };
  }
  // Flip to the other side when the preferred one doesn't fit.
  let top: number;
  if (placement === "top") {
    top = rect.top - GAP - cardH;
    if (top < MARGIN) top = rect.top + rect.height + GAP;
  } else {
    top = rect.top + rect.height + GAP;
    if (top + cardH > vh - MARGIN) top = Math.max(MARGIN, rect.top - GAP - cardH);
  }
  const left = Math.min(
    Math.max(MARGIN, rect.left + rect.width / 2 - CARD_W / 2),
    vw - CARD_W - MARGIN,
  );
  return { top: Math.max(MARGIN, Math.min(top, vh - cardH - MARGIN)), left };
}

export function OnboardingTour() {
  const open = useOnboardingStore((s) => s.open);
  const step = useOnboardingStore((s) => s.step);
  const next = useOnboardingStore((s) => s.next);
  const back = useOnboardingStore((s) => s.back);
  const dismiss = useOnboardingStore((s) => s.dismiss);

  const cardRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(180);

  const current = TOUR_STEPS[step];

  // Measure the target (and the card, whose height depends on its copy) after
  // every step, and again whenever the window changes shape under it.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      setRect(rectOf(current?.anchor));
      const h = cardRef.current?.offsetHeight;
      if (h) setCardH(h);
    };
    measure();
    const raf = requestAnimationFrame(measure); // after the card paints
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [open, step, current?.anchor]);

  // Keyboard: the tour owns the window while it's up. Escape leaves (the rule
  // is skippable, always), arrows and Enter walk it, Tab stays in the card.
  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Tab") {
        const items = cardRef.current?.querySelectorAll<HTMLElement>("button");
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === cardRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open, next, back, dismiss]);

  if (!open || !current) return null;

  const pos = cardPosition(rect, current.placement, cardH);
  const last = isLastStep(step);

  return createPortal(
    <div className="ui-chrome fixed inset-0 z-[6000]">
      {/* Swallows every click while the tour is up. */}
      <div
        className="absolute inset-0"
        style={{ background: rect ? "transparent" : "rgba(0,0,0,0.55)" }}
        onPointerDown={(e) => e.preventDefault()}
      />

      {rect && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[4px]"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            outline: "2px solid var(--accent)",
          }}
        />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        className="chrome-solid absolute p-4 text-[var(--text)] outline-none"
        style={{ top: pos.top, left: pos.left, width: CARD_W }}
      >
        <div className="ui-label mb-1.5">
          Step {step + 1} of {TOUR_STEPS.length}
        </div>
        <h2 id="tour-title" className="text-sm font-semibold">
          {current.title}
        </h2>
        <p id="tour-body" className="mt-1.5 text-xs leading-relaxed text-[var(--text-dim)]">
          {current.body}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            className="rounded-[3px] px-2 py-1.5 text-xs text-[var(--text-dim)] hover:bg-[var(--surface-hover)]"
            onClick={dismiss}
          >
            {last ? "Close" : "Skip"}
          </button>
          <div className="flex items-center gap-1.5">
            {step > 0 && (
              <button
                className="rounded-[3px] px-3 py-1.5 text-xs hover:bg-[var(--surface-hover)]"
                onClick={back}
              >
                Back
              </button>
            )}
            <button
              className="rounded-[3px] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--bg)] hover:opacity-90"
              onClick={next}
            >
              {last ? "Start using it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
