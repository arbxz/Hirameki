import { useEffect, useState } from "react";
import { useBoardStore } from "../store/boardStore";
import { resolveImageSrc } from "../lib/images";

// Fixed background image/gif for the active board. Sits behind the dot grid
// and the canvas; does not pan or zoom with the viewport. An <img> with
// object-fit (rather than a CSS background) so gifs reliably animate and
// contain-mode letterboxing is exact.

export function BoardBackground() {
  const board = useBoardStore((s) => s.board);
  const [src, setSrc] = useState<string | null>(null);

  const bgPath = board?.bgPath ?? null;
  const bgUrl = board?.bgUrl ?? null;

  useEffect(() => {
    let alive = true;
    if (bgUrl) {
      setSrc(bgUrl);
    } else if (bgPath) {
      void resolveImageSrc(bgPath).then((s) => {
        if (alive) setSrc(s);
      });
    } else {
      setSrc(null);
    }
    return () => {
      alive = false;
    };
  }, [bgPath, bgUrl]);

  if (!src || !board) return null;

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="pointer-events-none absolute inset-0 h-full w-full select-none"
      style={{ objectFit: board.bgFit }}
    />
  );
}
