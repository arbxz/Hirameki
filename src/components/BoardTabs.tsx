import { useEffect, useState } from "react";
import { Image as ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { useBoardStore } from "../store/boardStore";
import { BoardModal } from "./BoardModal";
import { BackgroundModal } from "./BackgroundModal";
import type { Board } from "../types/board";

// Folder-style board tabs across the top of the canvas. Click to switch, +
// to create (modal), right-click for rename/background/delete.

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

  // Close any open tab context menu on an outside click.
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuFor]);

  return (
    <div className="ui-chrome absolute left-1/2 top-3 z-20 flex max-w-[80vw] -translate-x-1/2 items-end gap-1 overflow-x-auto">
      {boards.map((b) => {
        const active = b.id === activeId;
        return (
          <div key={b.id} className="relative shrink-0">
            <button
              onClick={() => void switchBoard(b.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuFor(b.id);
              }}
              className={`flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-xs shadow-lg ring-1 ring-[var(--border)] backdrop-blur transition-colors ${
                active
                  ? "bg-[var(--surface-solid)] text-[var(--text)]"
                  : "bg-[var(--surface)] text-[var(--text-dim)] hover:bg-[var(--surface-hover)]"
              }`}
              title={b.name}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/20"
                style={{ background: b.color ?? "transparent" }}
              />
              <span className="max-w-32 truncate">{b.name}</span>
            </button>

            {menuFor === b.id && (
              <div
                className="absolute left-0 top-full z-30 mt-1 w-32 overflow-hidden rounded-lg bg-[var(--surface-solid)] py-1 text-xs text-[var(--text)] shadow-2xl ring-1 ring-[var(--border)]"
                onPointerDown={(e) => e.stopPropagation()}
              >
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
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={() => setEditing({ mode: "create" })}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-t-lg bg-[var(--surface)] text-[var(--text-dim)] shadow-lg ring-1 ring-[var(--border)] backdrop-blur hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        title="New board"
      >
        <Plus size={16} />
      </button>

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
          board={
            boards.find((b) => b.id === editing.board.id) ?? editing.board
          }
          onClose={() => setEditing(null)}
        />
      )}

      {/* delete confirmation */}
      {pendingDelete && (
        <div
          className="ui-chrome absolute inset-0 z-[4000] grid h-screen w-screen place-items-center bg-black/50"
          style={{ position: "fixed" }}
          onMouseDown={() => setPendingDelete(null)}
        >
          <div
            className="w-80 rounded-xl bg-[var(--surface-solid)] p-5 text-[var(--text)] shadow-2xl ring-1 ring-[var(--border)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold">
              Delete “{pendingDelete.name}”?
            </h2>
            <p className="mt-1 text-xs text-[var(--text-dim)]">
              All images and groups on this board will be removed. This can't be
              undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-dim)] hover:bg-[var(--surface-hover)]"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                onClick={() => {
                  void deleteBoard(pendingDelete.id);
                  setPendingDelete(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
