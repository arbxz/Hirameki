import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useBoardStore } from "../store/boardStore";

// Custom frameless title bar (the OS one is disabled via decorations:false in
// tauri.conf.json). The bar itself is the drag region (data-tauri-drag-region);
// the control buttons opt out of dragging so their clicks register.
//
// The glyphs are drawn here rather than taken from the icon set: at 10px an
// icon-font minus, square and cross come out at three different weights and
// optical sizes, which looks accidental next to the app's hairline chrome.
// These are one shape language — a 1px stroke on a 10px box — and they take
// their colour from the button, so every theme gets them right.

const appWindow = getCurrentWindow();

const GLYPH = {
  stroke: "currentColor",
  strokeWidth: 1,
  fill: "none",
  vectorEffect: "non-scaling-stroke",
} as const;

function Glyph({ kind }: { kind: "minimize" | "maximize" | "restore" }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      {kind === "minimize" && <path d="M0.5 5.5 H9.5" {...GLYPH} />}
      {kind === "maximize" && <rect x="0.5" y="0.5" width="9" height="9" {...GLYPH} />}
      {kind === "restore" && (
        <>
          {/* the window behind, peeking out top-right */}
          <path d="M2.5 2.5 V0.5 H9.5 V7.5 H7.5" {...GLYPH} />
          <rect x="0.5" y="2.5" width="7" height="7" {...GLYPH} />
        </>
      )}
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5" {...GLYPH} />
    </svg>
  );
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  // An unfocused window steps back: same layout, less ink. Matches the way
  // notes and canvas items stay calm until they're the thing being used.
  const [focused, setFocused] = useState(true);
  const boardName = useBoardStore((s) => s.board?.name ?? null);

  useEffect(() => {
    const unlisten: Array<() => void> = [];
    void appWindow.isMaximized().then(setMaximized);
    void appWindow.onResized(() => {
      void appWindow.isMaximized().then(setMaximized);
    }).then((u) => unlisten.push(u));
    void appWindow.onFocusChanged(({ payload }) => setFocused(payload))
      .then((u) => unlisten.push(u));
    return () => {
      for (const u of unlisten) u();
    };
  }, []);

  const button =
    "titlebar-control grid h-full w-11 place-items-center text-[var(--text-dim)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]";

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={() => void appWindow.toggleMaximize()}
      className={`flex h-8 shrink-0 select-none items-center justify-between border-b border-[var(--border)] bg-[var(--surface-solid)] pl-3 ${
        focused ? "" : "opacity-60"
      }`}
    >
      <span
        data-tauri-drag-region
        className="ui-mono flex min-w-0 items-baseline gap-2 text-[11px] text-[var(--text-dim)]"
      >
        <span data-tauri-drag-region className="text-[var(--text)]">
          Hirameki
        </span>
        {boardName && (
          <>
            <span data-tauri-drag-region aria-hidden="true">
              ·
            </span>
            {/* The window title is the board you're on — the one piece of
                state that was only visible as a highlighted tab. */}
            <span data-tauri-drag-region className="max-w-56 truncate">
              {boardName}
            </span>
          </>
        )}
      </span>

      <div className="flex h-full" onDoubleClick={(e) => e.stopPropagation()}>
        <button
          aria-label="Minimize"
          title="Minimize"
          onClick={() => void appWindow.minimize()}
          className={button}
        >
          <Glyph kind="minimize" />
        </button>
        <button
          aria-label={maximized ? "Restore" : "Maximize"}
          title={maximized ? "Restore" : "Maximize"}
          onClick={() => void appWindow.toggleMaximize()}
          className={button}
        >
          <Glyph kind={maximized ? "restore" : "maximize"} />
        </button>
        <button
          aria-label="Close"
          title="Close"
          onClick={() => void appWindow.close()}
          // Red on hover is the one place the app leaves its palette: closing
          // is the only irreversible control in the window, and every desktop
          // signals it the same way.
          className="titlebar-control grid h-full w-11 place-items-center text-[var(--text-dim)] hover:bg-red-600 hover:text-white"
        >
          <CloseGlyph />
        </button>
      </div>
    </div>
  );
}
