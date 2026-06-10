import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { useBoardStore } from "../store/boardStore";
import { BoardModal } from "./BoardModal";
import { BackgroundModal } from "./BackgroundModal";
import { ConfirmModal } from "./Modal";
import type { Board } from "../types/board";

// Board switcher rendered as a row of buttons inside the toolbar. Click a board
// button to switch; right-click (or the ⋯-style hover affordance) for rename /
// background / delete; the + button creates a new board. All dialogs use the
// shared full-screen Modal so nothing is clipped by the toolbar.

type Editing =
  | { mode: "create" }
  | { mode: "edit"; board: Board }
  | { mode: "background"; board: Board }
  | null;

export function BoardTabs() {
  const boards = useBoardStore((s) => s.boards);
  const activeId = useBoardStore((s) => s.board?.id ?? null);
  const switchBoard = useBoardStore((s) => s.switchBoard);
  const createBoard = useBoardStore((s) => s.createBoard);
  const updateBoard = useBoardStore((s) => s.updateBoard);
  const deleteBoard = useBoardStore((s) => s.deleteBoard);

  const [editing, setEditing] = useState<Editing>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Board | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the context menu on an outside click.
  useEffect(() => {
    if (!menuFor) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuFor(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuFor]);

  return (
    <>
      {/* board buttons, inline in the toolbar */}
      <div className="flex h-10 items-center gap-1 rounded-lg bg-[var(--surface)] px-1 text-[var(--text)] shadow-lg ring-1 ring-[var(--border)] backdrop-blur">
        {boards.map((b) => {
          const active = b.id === activeId;
          return (
            <button
              key={b.id}
              onClick={() => void switchBoard(b.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuFor(b.id);
              }}
              className={`flex h-8 items-center gap-1.5 rounded px-2.5 text-xs transition-colors ${
                active
                  ? "bg-[var(--accent)]/20 text-[var(--text)]"
                  : "text-[var(--text-dim)] hover:bg-[var(--surface-hover)]"
              }`}
              title={`${b.name} — right-click for options`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/20"
                style={{ background: b.color ?? "transparent" }}
              />
              <span className="max-w-28 truncate">{b.name}</span>
            </button>
          );
        })}

        <button
          onClick={() => setEditing({ mode: "create" })}
          className="grid h-8 w-8 shrink-0 place-items-center rounded text-[var(--text-dim)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          title="New board"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* context menu (fixed-position, anchored under the toolbar) */}
      {menuFor && (
        <div
          ref={menuRef}
          className="ui-chrome fixed left-4 top-14 z-[3000] w-36 overflow-hidden rounded-lg bg-[var(--surface-solid)] py-1 text-xs text-[var(--text)] shadow-2xl ring-1 ring-[var(--border)]"
        >
          {(() => {
            const b = boards.find((x) => x.id === menuFor);
            if (!b) return null;
            return (
              <>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-[var(--surface-hover)]"
                  onClick={() => {
                    setMenuFor(null);
                    setEditing({ mode: "edit", board: b });
                  }}
                >
                  <Pencil size={13} /> Rename
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-[var(--surface-hover)]"
                  onClick={() => {
                    setMenuFor(null);
                    setEditing({ mode: "background", board: b });
                  }}
                >
                  <ImageIcon size={13} /> Background
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-red-400 hover:bg-red-500/20 disabled:opacity-40"
                  disabled={boards.length <= 1}
                  onClick={() => {
                    setMenuFor(null);
                    setPendingDelete(b);
                  }}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* create / rename modal */}
      {editing?.mode === "create" && (
        <BoardModal
          title="New board"
          confirmLabel="Create"
          onConfirm={(name, color) => {
            void createBoard(name, color);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {editing?.mode === "edit" && (
        <BoardModal
          title="Rename board"
          confirmLabel="Save"
          initialName={editing.board.name}
          initialColor={editing.board.color}
          onConfirm={(name, color) => {
            void updateBoard(editing.board.id, { name, color });
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {editing?.mode === "background" && (
        <BackgroundModal
          // Always read the live board from the store so fit toggles applied
          // inside the modal don't operate on a stale snapshot.
          board={boards.find((b) => b.id === editing.board.id) ?? editing.board}
          onClose={() => setEditing(null)}
        />
      )}

      {/* delete confirmation */}
      {pendingDelete && (
        <ConfirmModal
          title={`Delete “${pendingDelete.name}”?`}
          message="All images and groups on this board will be removed. This can't be undone."
          onConfirm={() => {
            void deleteBoard(pendingDelete.id);
            setPendingDelete(null);
          }}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
