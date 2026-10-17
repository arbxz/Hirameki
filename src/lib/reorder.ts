// Pure helpers behind drag-to-reorder. Kept out of the component so the
// index arithmetic — the part that is easy to get subtly wrong — can be
// tested without a DOM or a pointer.

/**
 * Move one entry of `list` from `from` to `to`, returning a new array.
 * `to` is the index the entry ends up at *after* the move, so moving an item
 * right by one is `moveItem(list, i, i + 1)`. Out-of-range indices clamp, and
 * a no-op move returns an equal (but new) array.
 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  if (next.length === 0) return next;
  const f = Math.min(next.length - 1, Math.max(0, Math.trunc(from)));
  const t = Math.min(next.length - 1, Math.max(0, Math.trunc(to)));
  const [moved] = next.splice(f, 1);
  next.splice(t, 0, moved);
  return next;
}

/**
 * Where a drop at `x` should insert, given each item's horizontal midpoint in
 * order. The result is a *gap* index in 0..midpoints.length: 0 is before the
 * first item, length is after the last.
 */
export function insertionIndex(midpoints: number[], x: number): number {
  let i = 0;
  while (i < midpoints.length && x > midpoints[i]) i++;
  return i;
}

/**
 * The final order after dragging the item at `from` into gap `gap`.
 *
 * A gap index counts the dragged item itself, so dropping into the gap just
 * after your own position means "stay put" — hence the -1 once the gap is
 * past `from`. Without it, every rightward drag would overshoot by one.
 */
export function orderAfterDrop<T>(list: T[], from: number, gap: number): T[] {
  const to = gap > from ? gap - 1 : gap;
  return moveItem(list, from, to);
}
