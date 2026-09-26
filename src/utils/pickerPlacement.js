// The bowl picker hangs off whichever control opened it rather than centring
// itself on the screen: from the dashboard title it drops beneath the title,
// from the header switcher it lines up under the header. These are the pure
// halves of that, so the geometry is testable without a layout engine.

const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

// `anchor` is the trigger's bounding rect. "center" centres the panel under it
// (the dashboard title); "start" aligns their left edges (the header switcher,
// which sits at the left of the bar). Either way the panel never leaves the
// viewport, which on a phone means it simply spans the width.
export function getAnchoredPanelLayout({
  anchor,
  viewportWidth,
  viewportHeight,
  align = "center",
  maxWidth = 620,
  gutter = 10,
  gap = 10,
  minHeight = 200,
}) {
  const width = Math.max(0, Math.min(maxWidth, viewportWidth - gutter * 2));
  const preferredLeft = align === "start"
    ? anchor.left
    : anchor.left + anchor.width / 2 - width / 2;
  const left = clamp(preferredLeft, gutter, viewportWidth - gutter - width);
  const top = anchor.bottom + gap;
  // The list scrolls inside the panel, so a short viewport shrinks the panel
  // instead of pushing its footer off the screen.
  const maxHeight = Math.max(minHeight, viewportHeight - top - gutter);
  // The caret points at the trigger: its middle when centred, and just inside
  // its leading edge when start-aligned, where the bowl icon is.
  const caretTarget = align === "start"
    ? anchor.left + Math.min(28, anchor.width / 2)
    : anchor.left + anchor.width / 2;
  const caretLeft = clamp(caretTarget - left, 24, width - 24);
  return { top, left, width, maxHeight, caretLeft };
}

// Arrow keys move between tiles by position, because the tiles are a grid and
// a group with an odd count leaves the next group's columns out of step with
// DOM order. Returns the index of the nearest rect in `direction`, or `index`
// when nothing lies that way.
export function findNeighborIndex(rects, index, direction) {
  const from = rects[index];
  if (!from) return index;
  const cx = (rect) => rect.left + rect.width / 2;
  const cy = (rect) => rect.top + rect.height / 2;
  let best = index;
  let bestScore = Infinity;
  rects.forEach((rect, candidate) => {
    if (candidate === index) return;
    const dx = cx(rect) - cx(from);
    const dy = cy(rect) - cy(from);
    const ahead = {
      ArrowDown: dy > 1,
      ArrowUp: dy < -1,
      ArrowRight: dx > 1 && Math.abs(dy) < from.height / 2,
      ArrowLeft: dx < -1 && Math.abs(dy) < from.height / 2,
    }[direction];
    if (!ahead) return;
    const vertical = direction === "ArrowDown" || direction === "ArrowUp";
    // Weight drift on the cross axis so the tile straight below wins over a
    // nearer one diagonally below.
    const score = vertical ? Math.abs(dy) + Math.abs(dx) * 2 : Math.abs(dx) + Math.abs(dy) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  });
  return best;
}
