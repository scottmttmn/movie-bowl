// The shape of theater mode's curtains, as plain numbers so the component only
// paints. One curtain is a row of folds; each fold is a band between two
// boundaries running from the rail to the hem. Hanging, the boundaries are
// straight and evenly spaced. Opened, they sweep from the rail to a tie-back
// partway down, where every fold bunches together, and fan out again below it.
// Fabric gathered into a tie-back does that; a curtain drawn as a curved edge
// over straight stripes does not, and reads as a cutout.

export const CURTAIN_FOLDS = 8;
export const CURTAIN_ROWS = 40;
const TIE_AT = 0.58;
// How much of the stage each opened curtain keeps, at the rail, the tie-back
// and the hem. Around the bowl the stage is small and the curtains can be
// generous; over the whole screen they keep to the edges so the reveal has room.
const OPEN_SPAN = {
  stage: { rail: 0.68, tie: 0.19, hem: 0.36 },
  screen: { rail: 0.34, tie: 0.09, hem: 0.16 },
};

const lerp = (from, to, amount) => from + (to - from) * amount;

export function easeCurtain(amount) {
  const t = Math.min(1, Math.max(0, amount));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Distance from the curtain's outer edge to fold boundary `fold`
 * (0..CURTAIN_FOLDS, fractional allowed) at height `y` (0 rail .. 1 hem).
 *
 * `openness` is 0 for drawn shut and 1 for tied back. `spread` moves the open
 * shape from the stage around the bowl (0) to the whole screen (1).
 */
export function getCurtainBoundaryX(fold, y, { openness, halfWidth, spread = 0, folds = CURTAIN_FOLDS }) {
  const share = fold / folds;
  // A few pixels past the middle, so two closed curtains overlap rather than
  // leave a seam of light between them.
  const closed = share * (halfWidth + 7);
  const span = (key) => share * halfWidth * lerp(OPEN_SPAN.stage[key], OPEN_SPAN.screen[key], spread);
  let open;
  if (y <= TIE_AT) {
    const s = y / TIE_AT;
    open = span("rail") + (span("tie") - span("rail")) * (s * s * (3 - 2 * s));
  } else {
    const s = (y - TIE_AT) / (1 - TIE_AT);
    open = span("tie") + (span("hem") - span("tie")) * Math.sin((s * Math.PI) / 2);
  }
  // Hanging cloth is straight; gathered cloth never quite is.
  const sway = Math.sin(y * 7 + fold * 1.3) * 1.2 * openness * share;
  return lerp(closed, open, openness) + sway;
}

/**
 * Every fold of one curtain as a polygon, measured from its outer edge, plus
 * the inner edge on its own for the highlight. The right-hand curtain is the
 * same shape mirrored by the caller.
 */
export function getCurtainShape({ width, height, openness, spread = 0, folds = CURTAIN_FOLDS, rows = CURTAIN_ROWS }) {
  const halfWidth = width / 2;
  const options = { openness, halfWidth, spread, folds };
  const column = (fold) => {
    const points = [];
    for (let row = 0; row <= rows; row += 1) {
      const y = row / rows;
      points.push([getCurtainBoundaryX(fold, y, options), y * height]);
    }
    return points;
  };
  const bands = [];
  for (let fold = 0; fold < folds; fold += 1) {
    // Each band reaches a sliver into the next so no hairline shows between them.
    bands.push([...column(fold), ...column(fold + 1.02).reverse()]);
  }
  const edge = column(folds);
  return {
    bands,
    edge,
    tie: { y: TIE_AT * height, reach: getCurtainBoundaryX(folds, TIE_AT, options) },
  };
}
