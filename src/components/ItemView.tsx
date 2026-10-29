import { useEffect, useState } from "react";
import { resolveImageSrc } from "../lib/images";
import type { Item } from "../types/board";
import { itemTransform } from "./itemTransform";

// Renders a single board item. Position/size/rotation are expressed purely as a
// CSS transform (translate + rotate) on an element anchored at 0,0 — this is
// react-moveable's canonical model and behaves correctly inside the zoomed
// viewport. Placeholder items (no filePath) keep a colored box.
//
// Edge, hover, group and selection are all one `outline` in index.css, never a
// ring or a border: outline is drawn outside the box and costs no layout, so
// the four states can't resize the image between them. Grouped is dashed
// rather than a second colour — the drafting sheet's way of saying "annotation
// about this thing" instead of spending another hue.

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
      className={`board-item absolute left-0 top-0 overflow-hidden ${
        selected ? "is-selected" : item.groupId ? "is-grouped" : ""
      }`}
      style={{
        width: item.width,
        height: item.height,
        transform: itemTransform(item.x, item.y, item.rotation),
        transformOrigin: "0 0",
        background: item.filePath ? "#1a1a1a" : colorFor(item.id),
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
