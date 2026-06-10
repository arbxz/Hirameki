import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

// Modal for creating or editing a board: a title field and a color tag swatch
// row (the tag shows on the folder tab). Used for both "New board" and "Rename".

// A small curated palette for tab tags; null = no tag.
export const TAB_COLORS = [
  "#f87171", // red
  "#fb923c", // orange
  "#fbbf24", // amber
  "#34d399", // green
  "#38bdf8", // sky
  "#818cf8", // indigo
  "#c084fc", // purple
  "#f472b6", // pink
];

export function BoardModal({
  title,
  initialName,
  initialColor,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  initialName?: string;
  initialColor?: string | null;
  confirmLabel: string;
  onConfirm: (name: string, color: string | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [color, setColor] = useState<string | null>(initialColor ?? null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => onConfirm(name.trim() || "Untitled", color);

  return (
    <div
      className="ui-chrome absolute inset-0 z-[4000] grid place-items-center bg-black/50"
      onMouseDown={onCancel}
    >
      <div
        className="w-80 rounded-xl bg-[var(--surface-solid)] p-5 text-[var(--text)] shadow-2xl ring-1 ring-[var(--border)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            className="grid h-6 w-6 place-items-center rounded text-[var(--text-dim)] hover:bg-[var(--surface-hover)]"
            onClick={onCancel}
          >
            <X size={14} />
          </button>
        </div>

        <label className="mb-1 block text-[11px] text-[var(--text-dim)]">
          Name
        </label>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Board name"
          className="mb-4 w-full rounded-lg bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
        />

        <label className="mb-1.5 block text-[11px] text-[var(--text-dim)]">
          Tag color
        </label>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setColor(null)}
            className={`grid h-6 w-6 place-items-center rounded-full ring-1 ring-[var(--border)] ${
              color === null ? "ring-2 ring-[var(--accent)]" : ""
            }`}
            title="No tag"
          >
            <X size={12} className="text-[var(--text-dim)]" />
          </button>
          {TAB_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full ${
                color === c ? "ring-2 ring-offset-2 ring-offset-[var(--surface-solid)]" : ""
              }`}
              style={{
                background: c,
                ...(color === c ? { boxShadow: `0 0 0 2px ${c}` } : {}),
              }}
              title={c}
            />
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-dim)] hover:bg-[var(--surface-hover)]"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            onClick={submit}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
