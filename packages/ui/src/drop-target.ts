/** A block's box, or anything else's, in the editor's coordinates. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A gap between blocks: its position in the slot, and the line that shows it. */
export interface Gap {
  readonly index: number;
  readonly line: Box;
}

export function distanceTo(box: Box, x: number, y: number): number {
  const dx = Math.max(box.left - x, 0, x - box.right);
  const dy = Math.max(box.top - y, 0, y - box.bottom);
  return Math.hypot(dx, dy);
}

/** Whether two boxes sit side by side: they share more than half of the shorter one's height. */
function sideBySide(a: Box, b: Box): boolean {
  const shared = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return shared > Math.min(a.bottom - a.top, b.bottom - b.top) / 2;
}

/**
 * The gap nearest a point, among a slot's blocks however they're laid out: stacked, in a row, or wrapping in a grid.
 * A block's neighbours say which way it runs; the point's side of its middle says which of its gaps is meant.
 */
export function nearestGap(boxes: readonly Box[], x: number, y: number): Gap | null {
  if (!boxes.length) return null;
  let nearest = 0;
  boxes.forEach((box, i) => {
    if (distanceTo(box, x, y) < distanceTo(boxes[nearest]!, x, y)) nearest = i;
  });
  const box = boxes[nearest]!;
  const before = boxes[nearest - 1];
  const after = boxes[nearest + 1];
  const inRow = (before && sideBySide(before, box)) || (after && sideBySide(after, box));
  if (inRow) {
    const isBefore = x < (box.left + box.right) / 2;
    const at = isBefore ? box.left : box.right;
    return { index: isBefore ? nearest : nearest + 1, line: { left: at, right: at, top: box.top, bottom: box.bottom } };
  }
  const isBefore = y < (box.top + box.bottom) / 2;
  const at = isBefore ? box.top : box.bottom;
  return { index: isBefore ? nearest : nearest + 1, line: { left: box.left, right: box.right, top: at, bottom: at } };
}
