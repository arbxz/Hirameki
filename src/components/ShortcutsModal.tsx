import { Modal } from "./Modal";

// Keyboard reference, opened with `?` or from the settings panel. None of these
// shortcuts were discoverable before: the toolbar only shows tooltips, and those
// only appear on buttons that themselves only appear once something is selected.

const GROUPS: { title: string; rows: [string[], string][] }[] = [
  {
    title: "Canvas",
    rows: [
      [["Space", "drag"], "Pan the canvas"],
      [["Middle-drag"], "Pan the canvas"],
      [["Ctrl", "scroll"], "Zoom around the cursor"],
      [["Shift", "1"], "Zoom to fit everything"],
      [["Shift", "2"], "Zoom to the selection"],
    ],
  },
  {
    title: "Selection",
    rows: [
      [["Click"], "Select an image"],
      [["Shift", "click"], "Add to the selection"],
      [["Drag"], "Marquee-select"],
      [["Double-click"], "Select a whole group"],
      [["Esc"], "Deselect"],
    ],
  },
  {
    title: "Editing",
    rows: [
      [["Ctrl", "Z"], "Undo"],
      [["Ctrl", "Shift", "Z"], "Redo"],
      [["Del"], "Delete the selection"],
      [["Ctrl", "G"], "Group"],
      [["Ctrl", "Shift", "G"], "Ungroup"],
      [["Ctrl", "]"], "Bring to front"],
      [["Ctrl", "["], "Send to back"],
      [["Shift", "resize"], "Free the aspect-ratio lock"],
      [["Shift", "rotate"], "Snap rotation to 15°"],
    ],
  },
  {
    title: "Adding",
    rows: [
      [["Ctrl", "V"], "Paste an image or link"],
      [["Drop"], "Add images or image links"],
      [["Right-click"], "Add a note here"],
    ],
  },
];

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-sans text-[10px] font-medium text-[var(--text)]">
      {children}
    </kbd>
  );
}

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width="w-[30rem]">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="mb-1.5 text-[11px] font-semibold text-[var(--text-dim)]">
              {g.title}
            </h3>
            <ul className="space-y-1">
              {g.rows.map(([keys, label]) => (
                <li
                  key={label + keys.join()}
                  className="flex items-baseline justify-between gap-3 text-xs"
                >
                  <span className="text-[var(--text-dim)]">{label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {keys.map((k, i) => (
                      <span key={k + i} className="flex items-center gap-1">
                        {i > 0 && (
                          <span className="text-[10px] text-[var(--text-dim)]">
                            +
                          </span>
                        )}
                        <Key>{k}</Key>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-4 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text-dim)]">
        Press <Key>?</Key> any time to reopen this.
      </p>
    </Modal>
  );
}
