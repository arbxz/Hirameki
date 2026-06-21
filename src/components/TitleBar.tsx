import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Custom frameless title bar (the OS one is disabled via decorations:false in
// tauri.conf.json). The bar itself is the drag region (data-tauri-drag-region);
// the control buttons opt out of dragging so their clicks register.

const appWindow = getCurrentWindow();

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    appWindow.isMaximized().then(setMaximized);
    appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    }).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="flex h-8 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-solid)] pl-3 text-[var(--text-dim)] select-none"
    >
      <span data-tauri-drag-region className="text-xs font-medium tracking-wide">
        Hirameki
      </span>

      <div className="flex h-full">
        <button
          aria-label="Minimize"
          onClick={() => appWindow.minimize()}
          className="flex h-full w-11 items-center justify-center hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          <Minus size={15} />
        </button>
        <button
          aria-label={maximized ? "Restore" : "Maximize"}
          onClick={() => appWindow.toggleMaximize()}
          className="flex h-full w-11 items-center justify-center hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          {maximized ? <Copy size={13} /> : <Square size={12} />}
        </button>
        <button
          aria-label="Close"
          onClick={() => appWindow.close()}
          className="flex h-full w-11 items-center justify-center hover:bg-red-600 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
