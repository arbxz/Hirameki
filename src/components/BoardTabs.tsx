import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useBoardStore } from "../store/boardStore";
import { BoardModal } from "./BoardModal";
import { BackgroundModal } from "./BackgroundModal";
import { ConfirmModal } from "./Modal";
import { useMenuKeyboard } from "./useMenuKeyboard";
import { insertionIndex, moveItem, orderAfterDrop } from "../lib/reorder";
import type { Board } from "../types/board";

// Board switcher rendered as a row of buttons inside the toolbar. Click a board
// button to switch; drag one sideways to reorder; right-click (or the ⋯-style
// hover affordance) for rename / background / delete; the + button creates a
// new board. All dialogs use the shared full-screen Modal so nothing is
// clipped by the toolbar.
//
// The drag is pointer-based rather than HTML5 drag-and-drop: these tabs live
// in a WebView where a native drag would fight the canvas's own drop handling,
// and pointer capture gives the same gesture with less to go wrong. Dragging
// is never the only way — the context menu and Ctrl+Shift+arrows move a tab
// too (WCAG 2.2 "dragging movements").

// How far the pointer must travel before a press becomes a drag rather than a
// click. Below this, a slightly shaky click still just switches boards.
const DRAG_THRESHOLD = 4;

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
  // Context menu: which board, and where to anchor it (screen coords).
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<Board | null>(null);
  const reorderBoards = useBoardStore((s) => s.reorderBoards);
  // The tab being dragged, and the gap it would drop into.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);
  const [markerX, setMarkerX] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; moved: boolean } | null>(null);
  // Set when a press turned into a drag, so the click that follows the release
  // doesn't also switch boards.
  const suppressClick = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useMenuKeyboard(menuRef, menu !== null, () => setMenu(null));

  // Close the context menu on an outside click.
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  /** Move a board by one place; shared by the menu items and the shortcut. */
  const moveBoard = (id: string, delta: -1 | 1) => {
    const from = boards.findIndex((b) => b.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= boards.length) return;
    void reorderBoards(moveItem(boards.map((b) => b.id), from, to));
    // The row re-renders around the moved tab; keep the keyboard on it.
    requestAnimationFrame(() => {
      rowRef.current?.querySelector<HTMLElement>(`[data-board-id="${id}"]`)?.focus();
    });
  };

  const onTabPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    drag.current = { id, x: e.clientX, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onTabPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setDragId(d.id);
    }
    const row = rowRef.current;
    const tabs = row
      ? [...row.querySelectorAll<HTMLElement>("[data-board-id]")]
      : [];
    const mids = tabs.map((el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    const gap = insertionIndex(mids, e.clientX);
    setDropGap(gap);
    // Marker position is measured, not laid out: inserting a 6px element
    // between the tabs would shift every later tab mid-drag and make the drop
    // point drift under the pointer.
    const rowLeft = row?.getBoundingClientRect().left ?? 0;
    const edge =
      gap === 0
        ? (tabs[0]?.getBoundingClientRect().left ?? rowLeft) - 2
        : (tabs[gap - 1]?.getBoundingClientRect().right ?? rowLeft) + 2;
    setMarkerX(edge - rowLeft);
  };

  const onTabPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const gap = dropGap;
    setDragId(null);
    setDropGap(null);
    if (!d.moved) return;
    suppressClick.current = true;
    const from = boards.findIndex((b) => b.id === d.id);
    if (from < 0 || gap === null) return;
    const ids = orderAfterDrop(boards.map((b) => b.id), from, gap);
    if (ids.some((id, i) => id !== boards[i]?.id)) void reorderBoards(ids);
  };

  return (
    <>
      {/* board buttons, inline in the toolbar */}
      <div
        ref={rowRef}
        data-tour="boards"
        className="chrome relative flex h-10 items-center gap-1 px-1 text-[var(--text)]"
      >
        {dragId !== null && dropGap !== null && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-[var(--accent)]"
            style={{ left: markerX }}
          />
        )}
        {boards.map((b) => {
          const active = b.id === activeId;
          return (
            <span key={b.id} className="flex h-8 items-center">
              <button
                data-board-id={b.id}
                style={{ touchAction: "none" }}
                onPointerDown={(e) => onTabPointerDown(e, b.id)}
                onPointerMove={onTabPointerMove}
                onPointerUp={onTabPointerUp}
                onPointerCancel={onTabPointerUp}
                onKeyDown={(e) => {
                  // Keyboard equivalent of the drag.
                  if (!e.ctrlKey || !e.shiftKey) return;
                  if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    moveBoard(b.id, -1);
                  } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    moveBoard(b.id, 1);
                  }
                }}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  void switchBoard(b.id);
                }}
                onContextMenu={(e) => {
                e.preventDefault();
                // Anchor the menu just under the tab that was clicked, clamped
                // so a right-most tab's menu doesn't overflow the window.
                const r = e.currentTarget.getBoundingClientRect();
                const MENU_W = 144; // w-36
                setMenu({
                  id: b.id,
                  x: Math.min(r.left, window.innerWidth - MENU_W - 8),
                  y: r.bottom + 6,
                });
              }}
                className={`flex h-8 items-center gap-1.5 px-2.5 text-xs transition-colors ${
                  dragId === b.id ? "opacity-50" : ""
                } ${
                  active ? "tab-active" : "text-[var(--text-dim)]"
                }`}
                aria-label={`${b.name} board${active ? " (current)" : ""}`}
                aria-current={active ? "true" : undefined}
                aria-haspopup="menu"
                // The context-menu key and Shift+F10 fire contextmenu on the
                // focused tab too, so the menu is reachable without a mouse.
                title={`${b.name} — drag to reorder · right-click or Shift+F10 for options`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-[var(--line-strong)]"
                  style={{ background: b.color ?? "transparent" }}
                />
                <span className="max-w-28 truncate">{b.name}</span>
              </button>
            </span>
          );
        })}

        <button
          onClick={() => setEditing({ mode: "create" })}
          className="grid h-8 w-8 shrink-0 place-items-center text-[var(--text-dim)] hover:text-[var(--text)]"
          aria-label="New board"
          title="New board"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* context menu, anchored under the clicked tab */}
      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Board options"
          className="chrome-solid ui-chrome fixed z-[3000] w-36 overflow-hidden py-1 text-xs text-[var(--text)]"
          style={{ left: menu.x, top: menu.y }}
        >
          {(() => {
            const b = boards.find((x) => x.id === menu.id);
            if (!b) return null;
            return (
              <>
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 focus-visible:bg-[var(--surface-hover)]"
                  onClick={() => {
                    setMenu(null);
                    setEditing({ mode: "edit", board: b });
                  }}
                >
                  <Pencil size={13} /> Rename
                </button>
                <button
                  role="menuitem"
                  disabled={boards[0]?.id === b.id}
                  className="flex w-full items-center gap-2 px-3 py-1.5 focus-visible:bg-[var(--surface-hover)] disabled:opacity-40"
                  onClick={() => {
                    setMenu(null);
                    moveBoard(b.id, -1);
                  }}
                >
                  <ChevronLeft size={13} /> Move left
                </button>
                <button
                  role="menuitem"
                  disabled={boards[boards.length - 1]?.id === b.id}
                  className="flex w-full items-center gap-2 px-3 py-1.5 focus-visible:bg-[var(--surface-hover)] disabled:opacity-40"
                  onClick={() => {
                    setMenu(null);
                    moveBoard(b.id, 1);
                  }}
                >
                  <ChevronRight size={13} /> Move right
                </button>
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 focus-visible:bg-[var(--surface-hover)]"
                  onClick={() => {
                    setMenu(null);
                    setEditing({ mode: "background", board: b });
                  }}
                >
                  <ImageIcon size={13} /> Background
                </button>
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[var(--danger)] disabled:opacity-40"
                  disabled={boards.length <= 1}
                  // Say why it's greyed out instead of leaving a dead control.
                  title={
                    boards.length <= 1
                      ? "The only board can't be deleted"
                      : undefined
                  }
                  onClick={() => {
                    setMenu(null);
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
