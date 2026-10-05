import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Modal } from "./Modal";

// Modal for creating or editing a board: a title field and a color tag swatch
// row (the tag shows on the board button). Used for both "New board" and
// "Rename". Overlay/portal behavior lives in the shared Modal component.

// A small curated palette for tab tags; null = no tag.
const TAB_COLORS = [
  "#f87171", // red
  "#fb923c", // orange
  "#fbbf24", // amber
  "#34d399", // green
  "#38bdf8", // sky
  "#818cf8", // indigo
  "#c084fc", // purple
  "#f472b6", // pink
];

// Spoken names for the swatches; a hex code is not a colour name.
const TAB_COLOR_NAMES: Record<string, string> = {
  "#f87171": "Red",
  "#fb923c": "Orange",
  "#fbbf24": "Amber",
  "#34d399": "Green",
  "#38bdf8": "Sky",
  "#818cf8": "Indigo",
  "#c084fc": "Purple",
  "#f472b6": "Pink",
};

// Selected swatch: a gap in the dialog colour, then a ring in the text colour.
// The old ring was drawn in the swatch's own colour with no gap, so it just
// made the dot 2px bigger — hard to spot, and invisible for a colour-blind eye.
const SELECTED_RING =
  "0 0 0 2px var(--surface-solid), 0 0 0 4px var(--text)";

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
  const nameId = useId();
  const colorLabelId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => onConfirm(name.trim() || "Untitled", color);

  return (
    <Modal title={title} onClose={onCancel}>
      <label
        htmlFor={nameId}
        className="ui-label mb-1 block"
      >
        Name
      </label>
      <input
        id={nameId}
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="Board name"
        className="mb-4 w-full rounded-[3px] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
      />

      <div
        id={colorLabelId}
        className="ui-label mb-1.5 block"
      >
        Tag color
      </div>
      <div
        role="group"
        aria-labelledby={colorLabelId}
        className="mb-5 flex flex-wrap items-center gap-2"
      >
        <button
          onClick={() => setColor(null)}
          className="swatch grid h-6 w-6 place-items-center rounded-full ring-1 ring-[var(--border)] hover:ring-[var(--text-dim)]"
          style={color === null ? { boxShadow: SELECTED_RING } : undefined}
          aria-label="No tag"
          aria-pressed={color === null}
          title="No tag"
        >
          <X size={12} className="text-[var(--text-dim)]" />
        </button>
        {TAB_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className="swatch h-6 w-6 rounded-full"
            style={{
              background: c,
              ...(color === c ? { boxShadow: SELECTED_RING } : {}),
            }}
            aria-label={TAB_COLOR_NAMES[c] ?? c}
            aria-pressed={color === c}
            title={TAB_COLOR_NAMES[c] ?? c}
          />
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <button
          className="rounded-[3px] px-3 py-1.5 text-xs text-[var(--text-dim)] hover:bg-[var(--surface-hover)]"
          onClick={onCancel}
        >
          Cancel
        </button>
        {/* Text in the canvas colour, not white: most presets have a light
            accent (white on the Dark sky-400 is 2.1:1), and every preset's
            bg sits at 5:1 or more against its own accent. */}
        <button
          className="rounded-[3px] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--bg)] hover:opacity-90"
          onClick={submit}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
