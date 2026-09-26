import { describe, expect, it } from "vitest";
import { findNeighborIndex, getAnchoredPanelLayout } from "../pickerPlacement";

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

describe("getAnchoredPanelLayout", () => {
  it("centres the panel just below a centred title on desktop", () => {
    const layout = getAnchoredPanelLayout({
      anchor: rect(500, 78, 280, 48), viewportWidth: 1280, viewportHeight: 800,
    });
    expect(layout).toMatchObject({ top: 136, left: 330, width: 620, caretLeft: 310 });
    expect(layout.maxHeight).toBe(800 - 136 - 10);
  });

  it("aligns to the trigger's left edge and points at its icon when start-aligned", () => {
    const layout = getAnchoredPanelLayout({
      anchor: rect(88, 10, 320, 44), viewportWidth: 1280, viewportHeight: 800, align: "start",
    });
    expect(layout).toMatchObject({ top: 64, left: 88, caretLeft: 28 });
  });

  it("spans a phone's width inside the gutters and keeps the caret on the trigger", () => {
    const layout = getAnchoredPanelLayout({
      anchor: rect(10, 68, 200, 46), viewportWidth: 390, viewportHeight: 844,
    });
    expect(layout).toMatchObject({ left: 10, width: 370, caretLeft: 100 });
  });

  it("never lets the panel run off the right edge", () => {
    const layout = getAnchoredPanelLayout({
      anchor: rect(1100, 10, 160, 44), viewportWidth: 1280, viewportHeight: 800, align: "start",
    });
    expect(layout.left + layout.width).toBe(1270);
    expect(layout.caretLeft).toBeLessThanOrEqual(layout.width - 24);
  });

  it("shrinks to the room below the trigger so the list scrolls instead", () => {
    const layout = getAnchoredPanelLayout({
      anchor: rect(10, 68, 200, 46), viewportWidth: 740, viewportHeight: 400,
    });
    expect(layout).toMatchObject({ top: 124, maxHeight: 266 });
  });

  it("rises over the trigger rather than running off a very short viewport", () => {
    const layout = getAnchoredPanelLayout({
      anchor: rect(10, 68, 200, 46), viewportWidth: 740, viewportHeight: 300,
    });
    expect(layout.maxHeight).toBe(200);
    expect(layout.top + layout.maxHeight).toBeLessThanOrEqual(290);
    expect(layout.top).toBe(90);
  });

  it("never exceeds a viewport too short for the minimum height", () => {
    const layout = getAnchoredPanelLayout({
      anchor: rect(10, 68, 200, 46), viewportWidth: 740, viewportHeight: 150,
    });
    expect(layout).toMatchObject({ top: 10, maxHeight: 130 });
  });
});

describe("findNeighborIndex", () => {
  // Two columns: an odd first group, then a second group starting a new row.
  const rects = [
    rect(0, 0, 100, 50), rect(110, 0, 100, 50),
    rect(0, 60, 100, 50),
    rect(0, 150, 100, 50), rect(110, 150, 100, 50),
  ];

  it("moves across a row", () => {
    expect(findNeighborIndex(rects, 0, "ArrowRight")).toBe(1);
    expect(findNeighborIndex(rects, 1, "ArrowLeft")).toBe(0);
  });

  it("moves straight down by position rather than document order", () => {
    expect(findNeighborIndex(rects, 0, "ArrowDown")).toBe(2);
    expect(findNeighborIndex(rects, 2, "ArrowDown")).toBe(3);
    expect(findNeighborIndex(rects, 4, "ArrowUp")).toBe(1);
  });

  it("stays put when nothing lies in that direction", () => {
    expect(findNeighborIndex(rects, 2, "ArrowRight")).toBe(2);
    expect(findNeighborIndex(rects, 0, "ArrowUp")).toBe(0);
  });
});
