// Canvas apps must never highlight text while panning/dragging. CSS
// `user-select: none` is the first line of defense, but child libraries
// (infinite-viewer, moveable) can re-enable selection on their own nodes, and
// some WebView builds still start a selection on mousedown-drag. This guard
// cancels `selectstart` globally unless the event originates inside a real
// editable field (board/group title inputs in later phases).
export function installSelectionGuard(): () => void {
  const isEditable = (el: EventTarget | null): boolean => {
    const node = el as HTMLElement | null;
    if (!node || !node.closest) return false;
    return !!node.closest('input, textarea, [contenteditable="true"]');
  };

  const onSelectStart = (e: Event) => {
    if (!isEditable(e.target)) e.preventDefault();
  };

  document.addEventListener("selectstart", onSelectStart);
  return () => document.removeEventListener("selectstart", onSelectStart);
}
