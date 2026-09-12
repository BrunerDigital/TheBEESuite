/** Minimal horizontal correction only; callers retain vertical scroll/focus. */
export function activeItemScrollDelta(viewport: { left: number; right: number }, item: { left: number; right: number }): number {
  if (item.left < viewport.left) return item.left - viewport.left;
  if (item.right > viewport.right) return item.right - viewport.right;
  return 0;
}
