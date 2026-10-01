import { describe, expect, it } from "vitest";
import { CURTAIN_FOLDS, getCurtainBoundaryX, getCurtainShape } from "../theaterCurtains";

const HALF = 200;

describe("theater curtain geometry", () => {
  it("hangs straight and evenly when drawn shut, meeting just past the middle", () => {
    const options = { openness: 0, halfWidth: HALF };
    for (const y of [0, 0.3, 0.6, 1]) {
      expect(getCurtainBoundaryX(CURTAIN_FOLDS, y, options)).toBeCloseTo(HALF + 7);
      expect(getCurtainBoundaryX(CURTAIN_FOLDS / 2, y, options)).toBeCloseTo((HALF + 7) / 2);
    }
  });

  // Gathered cloth bunches at the tie-back and fans out below it; the folds
  // following the edge is what keeps it from reading as a cutout.
  it("gathers every fold into the tie-back when opened", () => {
    const options = { openness: 1, halfWidth: HALF };
    const atRail = getCurtainBoundaryX(CURTAIN_FOLDS, 0, options);
    const atTie = getCurtainBoundaryX(CURTAIN_FOLDS, 0.58, options);
    const atHem = getCurtainBoundaryX(CURTAIN_FOLDS, 1, options);
    expect(atTie).toBeLessThan(atRail / 2);
    expect(atHem).toBeGreaterThan(atTie);
    expect(atHem).toBeLessThan(atRail);

    const foldWidthAtRail = getCurtainBoundaryX(4, 0, options) - getCurtainBoundaryX(3, 0, options);
    const foldWidthAtTie = getCurtainBoundaryX(4, 0.58, options) - getCurtainBoundaryX(3, 0.58, options);
    expect(foldWidthAtTie).toBeLessThan(foldWidthAtRail / 2);
  });

  it("keeps to the screen's edges when spread over the whole reveal", () => {
    const stage = getCurtainBoundaryX(CURTAIN_FOLDS, 0.2, { openness: 1, halfWidth: HALF, spread: 0 });
    const screen = getCurtainBoundaryX(CURTAIN_FOLDS, 0.2, { openness: 1, halfWidth: HALF, spread: 1 });
    expect(screen).toBeLessThan(stage);
  });

  it("describes one band per fold, rail to hem, and the tie-back", () => {
    const shape = getCurtainShape({ width: 400, height: 200, openness: 1, rows: 10 });
    expect(shape.bands).toHaveLength(CURTAIN_FOLDS);
    expect(shape.edge).toHaveLength(11);
    expect(shape.edge[0][1]).toBe(0);
    expect(shape.edge[10][1]).toBe(200);
    expect(shape.tie.y).toBeCloseTo(116);
    expect(shape.tie.reach).toBeGreaterThan(0);
  });
});
