import { useEffect, useRef, type RefObject } from "react";

// Keyboard behaviour for the app's small popup menus (board tab menu, zoom
// menu): focus moves into the menu when it opens, arrows / Home / End walk its
// items, Escape closes it and puts focus back on the control that opened it,
// and Tab closes it rather than letting focus wander off behind it.
//
// Pass the menu element's ref; items are its enabled [role="menuitem"]s.

const ITEM = '[role="menuitem"]:not(:disabled)';

export function useMenuKeyboard(
  menuRef: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  // Latest-value ref, so callers can pass an inline arrow.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    // Whatever had focus when the menu opened: a keyboard user's tab, or
    // nothing useful (body) for a right-click, in which case we skip restoring.
    const opener = document.activeElement as HTMLElement | null;
    const items = () => [...menu.querySelectorAll<HTMLElement>(ITEM)];
    items()[0]?.focus();

    const close = (restore: boolean) => {
      onCloseRef.current();
      if (restore && opener && opener !== document.body) opener.focus();
    };

    const onKey = (e: KeyboardEvent) => {
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          list[(i + 1) % list.length]?.focus();
          break;
        case "ArrowUp":
          e.preventDefault();
          list[(i - 1 + list.length) % list.length]?.focus();
          break;
        case "Home":
          e.preventDefault();
          list[0]?.focus();
          break;
        case "End":
          e.preventDefault();
          list[list.length - 1]?.focus();
          break;
        case "Escape":
          // Stop here: the canvas also listens for Escape (clear selection).
          e.preventDefault();
          e.stopPropagation();
          close(true);
          break;
        case "Tab":
          close(false);
          break;
      }
    };
    menu.addEventListener("keydown", onKey);
    return () => menu.removeEventListener("keydown", onKey);
  }, [open, menuRef]);
}
