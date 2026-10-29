import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { useToastStore, type ToastKind } from "../store/toastStore";

// Renders the toast stack bottom-centre, clear of the zoom controls in the
// bottom-right corner. `ui-chrome` keeps Selecto from starting a marquee on it;
// the wrapper is pointer-transparent so an empty stack never steals canvas
// clicks.

const ICONS: Record<ToastKind, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
  progress: Loader2,
};

// Only the error case departs from the theme tokens — it needs to read as a
// failure regardless of which theme is active.
const TONE: Record<ToastKind, string> = {
  info: "text-[var(--text-dim)]",
  success: "text-emerald-400",
  error: "text-[var(--danger)]",
  progress: "text-[var(--text-dim)]",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const pause = useToastStore((s) => s.pause);
  const resume = useToastStore((s) => s.resume);

  // The live region stays mounted even when empty: screen readers announce
  // changes *inside* an existing region, so one that mounts together with its
  // first toast is usually read late or not at all.
  return (
    <div
      className="ui-chrome pointer-events-none fixed bottom-4 left-1/2 z-[4000] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            // Failures interrupt; everything else waits its turn.
            role={t.kind === "error" ? "alert" : undefined}
            onPointerEnter={() => pause(t.id)}
            onPointerLeave={(e) => {
              if (!e.currentTarget.contains(document.activeElement)) resume(t.id);
            }}
            onFocus={() => pause(t.id)}
            onBlur={(e) => {
              const el = e.currentTarget;
              if (!el.contains(e.relatedTarget) && !el.matches(":hover")) {
                resume(t.id);
              }
            }}
            className={`chrome-solid pointer-events-auto flex w-full items-center gap-2.5 py-2 pl-3 pr-2 text-xs text-[var(--text)] ${
              t.kind === "error" ? "border-[var(--danger)]" : ""
            }`}
          >
            <Icon
              size={15}
              className={`shrink-0 ${TONE[t.kind]} ${
                t.kind === "progress" ? "animate-spin" : ""
              }`}
            />
            <span className="min-w-0 flex-1 break-words leading-snug">
              {t.message}
            </span>
            {t.action && (
              <button
                className="shrink-0 px-2 py-1 text-xs font-medium text-[var(--accent)]"
                onClick={() => {
                  t.action?.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              className="grid h-6 w-6 shrink-0 place-items-center text-[var(--text-dim)] hover:text-[var(--text)]"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
