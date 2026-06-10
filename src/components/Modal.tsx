import { useEffect } from "react";
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
}: {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Tailwind width class for the card (default w-80). */
  width?: string;
}) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="ui-chrome fixed inset-0 z-[5000] grid place-items-center bg-black/50 p-4"
      onMouseDown={onClose}
    >
      <div
        className={`${width} max-h-[90vh] overflow-y-auto rounded-xl bg-[var(--surface-solid)] p-5 text-[var(--text)] shadow-2xl ring-1 ring-[var(--border)]`}
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
    <Modal onClose={onClose}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-[var(--text-dim)]">{message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-dim)] hover:bg-[var(--surface-hover)]"
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          autoFocus
          className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white ${
            danger ? "bg-red-600 hover:bg-red-500" : "bg-[var(--accent)] hover:opacity-90"
          }`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
