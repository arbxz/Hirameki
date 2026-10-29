import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useWorkspaceStore } from "../store/workspaceStore";
import { ConfirmModal } from "./Modal";
import { WorkspaceModal } from "./WorkspaceModal";

// The workspace switcher: the first cell in the canvas toolbar, before the
// board tabs, because a workspace is the level above them and the tabs should
// read as belonging to it.
//
// Styled as a title-block cell from the design system — a vermilion mark, the
// name in the mono label voice — rather than a dropdown with a chevron-shaped
// personality of its own. The menu reuses BoardTabs' pattern: a `.chrome-solid`
// panel of `role="menuitem"` buttons, closed on outside click or Escape.

export function WorkspaceCell() {
  const workspaces = useWorkspaceStore((w) => w.workspaces);
  const activeId = useWorkspaceStore((w) => w.activeId);
  const defaultId = useWorkspaceStore((w) => w.defaultId);
  const switchTo = useWorkspaceStore((w) => w.switchTo);
  const setDefault = useWorkspaceStore((w) => w.setDefault);
  const remove = useWorkspaceStore((w) => w.remove);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<"create" | "rename" | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = workspaces.find((w) => w.id === activeId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex w-full items-center gap-2 px-3 py-1.5 focus-visible:bg-[var(--surface-hover)] disabled:opacity-40";

  return (
    <div ref={rootRef} className="relative" data-tour="workspace">
      <button
        className="chrome ui-label flex h-10 items-center gap-2 px-2.5 text-[var(--text)]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Workspace: ${active?.name ?? "none"}`}
        title="Switch workspace"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="mark" aria-hidden="true" />
        <span className="max-w-32 truncate">{active?.name ?? "—"}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="chrome-solid absolute left-0 top-11 z-50 w-56 overflow-hidden py-1 text-xs text-[var(--text)]"
        >
          {workspaces.map((w) => (
            <button
              key={w.id}
              role="menuitem"
              className={item}
              aria-current={w.id === activeId ? "true" : undefined}
              onClick={() => {
                setOpen(false);
                void switchTo(w.id);
              }}
            >
              {/* A fixed-width slot, so the names line up whether or not a
                  workspace is the current one. */}
              <span className="w-3.5 shrink-0">
                {w.id === activeId && <Check size={13} aria-hidden="true" />}
              </span>
              <span className="flex-1 truncate text-left">{w.name}</span>
              {w.id === defaultId && (
                <span title="Opens by default" className="flex">
                  <Star size={11} aria-hidden="true" />
                </span>
              )}
            </button>
          ))}

          <div className="my-1 border-t border-[var(--border)]" />

          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              setEditing("create");
            }}
          >
            <Plus size={13} aria-hidden="true" /> New workspace
          </button>
          <button
            role="menuitem"
            className={item}
            disabled={!active}
            onClick={() => {
              setOpen(false);
              setEditing("rename");
            }}
          >
            <Pencil size={13} aria-hidden="true" /> Rename
          </button>
          <button
            role="menuitem"
            className={item}
            disabled={!active || active.id === defaultId}
            onClick={() => {
              setOpen(false);
              if (active) setDefault(active.id);
            }}
          >
            <Star size={13} aria-hidden="true" /> Set as default
          </button>
          <button
            role="menuitem"
            className={`${item} danger text-[var(--danger)]`}
            disabled={workspaces.length <= 1}
            // Say why it's greyed out rather than leaving a dead control.
            title={
              workspaces.length <= 1
                ? "The only workspace can't be deleted"
                : undefined
            }
            onClick={() => {
              setOpen(false);
              setPendingDelete(true);
            }}
          >
            <Trash2 size={13} aria-hidden="true" /> Delete
          </button>
        </div>
      )}

      {editing && (
        <WorkspaceModal
          mode={editing}
          current={editing === "rename" ? active : null}
          onClose={() => setEditing(null)}
        />
      )}

      {pendingDelete && active && (
        <ConfirmModal
          title={`Delete "${active.name}"?`}
          // Spell out the blast radius: this is the one action in the app that
          // can remove several boards at once.
          message="Every board, image and note in this workspace goes with it. This can't be undone."
          confirmLabel="Delete workspace"
          onConfirm={() => {
            setPendingDelete(false);
            void remove(active.id);
          }}
          onClose={() => setPendingDelete(false)}
        />
      )}
    </div>
  );
}
