// Kept out of ItemView.tsx so that file only exports components, which
// Vite's fast refresh needs.

/** The single source of truth for an item's visual transform. */
export function itemTransform(x: number, y: number, rotation: number): string {
  return `translate(${x}px, ${y}px) rotate(${rotation}deg)`;
}
