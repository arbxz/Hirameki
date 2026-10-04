import { useEffect, useState } from "react";
import { resolveImageSrc } from "../lib/images";
import type { Item } from "../types/board";
import { itemTransform } from "./itemTransform";

// Renders a single board item. Position/size/rotation are expressed purely as a
// CSS transform (translate + rotate) on an element anchored at 0,0 — this is
// react-moveable's canonical model and behaves correctly inside the zoomed
// viewport. Placeholder items (no filePath) keep a colored box.

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 55%)`;
}

export function ItemView({
  item,
  selected,
}: {
  item: Item;
  selected: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (item.filePath) {
      resolveImageSrc(item.filePath).then((s) => {
        if (alive) setSrc(s);
      });
    } else {
      setSrc(null);
    }
    return () => {
      alive = false;
    };
  }, [item.filePath]);

  return (
    <div
      data-item-id={item.id}
      className={`board-item absolute left-0 top-0 overflow-hidden rounded-[3px] shadow-lg ${
        selected
          ? "ring-2"
          : item.groupId
            ? "ring-2 ring-violet-400/60"
            : "ring-1 ring-black/20"
      }`}
      style={{
        width: item.width,
        height: item.height,
        transform: itemTransform(item.x, item.y, item.rotation),
        transformOrigin: "0 0",
        background: item.filePath ? "#1a1a1a" : colorFor(item.id),
        ...(selected ? { boxShadow: `0 0 0 2px var(--accent)` } : null),
      }}
    >
      {src && (
        <img
          src={src}
          alt=""
          className="pointer-events-none h-full w-full object-cover"
          draggable={false}
        />
      )}
    </div>
  );
}
