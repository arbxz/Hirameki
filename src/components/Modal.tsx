import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Reusable full-screen modal. Rendered through a portal to <body> so it can
// never be clipped by an ancestor's overflow/transform (the reason the old
// inline modals collapsed inside the toolbar). Provides a dimmed backdrop,
// click-outside + Escape to close, and a centered card.

export function Modal({
  title,
  onClose,
  children,
  width = "w-80",
  ariaLabel,
}: {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Tailwind width class for the card (default w-80). */
  width?: string;
  /** Accessible name when the dialog draws its own heading instead of
   *  passing `title` (ConfirmModal does this to keep its compact layout). */
  ariaLabel?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Callers pass an inline arrow for onClose, so its identity changes on every
  // parent render. Depending on it directly would re-subscribe the listener
  // below mid-dispatch: keydown is a discrete event, so a setState in an
  // earlier window listener (Canvas clearing its selection on Escape) flushes
  // synchronously, re-rendering the parent and swapping this listener out
  // before it is reached — and the DOM skips listeners removed or added during
  // a dispatch. The result was Escape silently failing to close the dialog.
  // Reading through a ref keeps the subscription stable for the modal's life.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Escape closes; Tab is trapped inside the card. Without the trap, tabbing out
  // of a modal lands on the canvas behind it, where the focus ring is invisible
  // and Enter can fire a toolbar action the dialog is supposed to be blocking.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = cardRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      // The card itself holds focus when nothing inside asked for it; treat it
      // as sitting before the first control.
      const onCard = active === cardRef.current;
      const outside = !cardRef.current?.contains(active);
      if (e.shiftKey && (active === first || onCard || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Return focus to whatever opened the dialog once it closes. The opener is
  // read during the first render: by the time an effect runs, a child's
  // autoFocus has already moved focus into the card, so reading it there would
  // "restore" focus to a button that is about to unmount.
  const openerRef = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    // Dialogs without an autoFocus child still need focus inside them, or the
    // first Tab walks the page behind the overlay.
    const card = cardRef.current;
    if (card && !card.contains(document.activeElement)) card.focus();
    const opener = openerRef.current;
    return () => opener?.focus?.();
  }, []);

  return createPortal(
    <div
      className="ui-chrome fixed inset-0 z-[5000] grid place-items-center bg-black/50 p-4"
      onMouseDown={onClose}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? title}
        tabIndex={-1}
        className={`${width} outline-none max-h-[90vh] overflow-y-auto rounded-xl bg-[var(--surface-solid)] p-5 text-[var(--text)] shadow-2xl ring-1 ring-[var(--border)]`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button
              className="grid h-6 w-6 place-items-center rounded text-[var(--text-dim)] hover:bg-[var(--surface-hover)]"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

// Small helper for a standard confirm dialog (used for deletes).
export function ConfirmModal({
  title,
  message,
  confirmLabel = "Delete",
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} ariaLabel={title}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-[var(--text-dim)]">{message}</p>
      <div className="mt-4 flex justify-end gap-2">
        {/* Cancel takes focus, not the destructive button: these dialogs open
            in response to a keypress (Delete), and focusing Confirm turns a
            reflexive Enter into the very action the dialog exists to guard. */}
        <button
          autoFocus
          className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-dim)] hover:bg-[var(--surface-hover)]"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          // Non-danger: canvas-coloured text on the accent (see BoardModal).
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            danger
              ? "bg-red-600 text-white hover:bg-red-500"
              : "bg-[var(--accent)] text-[var(--bg)] hover:opacity-90"
          }`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
