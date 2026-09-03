import { describe, expect, it } from "vitest";
import { canReturnDrawToBowl, RETURN_UNDO_WINDOW_MS } from "../watchHistory";

const drawnAt = new Date("2026-02-23T18:00:00.000Z");
const at = (offsetMs) => drawnAt.getTime() + offsetMs;

describe("return undo window", () => {
  it("allows a return inside the window", () => {
    expect(canReturnDrawToBowl({ drawn_at: drawnAt.toISOString() }, at(60_000))).toBe(true);
  });

  it("treats the exact boundary as still inside the window", () => {
    expect(
      canReturnDrawToBowl({ drawn_at: drawnAt.toISOString() }, at(RETURN_UNDO_WINDOW_MS))
    ).toBe(true);
  });

  it("refuses a return once the window has passed", () => {
    expect(
      canReturnDrawToBowl({ drawn_at: drawnAt.toISOString() }, at(RETURN_UNDO_WINDOW_MS + 1))
    ).toBe(false);
  });

  it("refuses a draw that was already returned", () => {
    expect(
      canReturnDrawToBowl(
        { drawn_at: drawnAt.toISOString(), returned_at: drawnAt.toISOString() },
        at(60_000)
      )
    ).toBe(false);
  });

  it("accepts either casing the surfaces use", () => {
    expect(canReturnDrawToBowl({ drawnAt: drawnAt.toISOString() }, at(60_000))).toBe(true);
    expect(
      canReturnDrawToBowl({ drawnAt: drawnAt.toISOString(), returnedAt: "x" }, at(60_000))
    ).toBe(false);
  });

  it("refuses rather than guesses when the draw time is unreadable", () => {
    // Offering an action the database will reject is worse than withholding it.
    expect(canReturnDrawToBowl({ drawn_at: "not a date" }, at(60_000))).toBe(false);
    expect(canReturnDrawToBowl({}, at(60_000))).toBe(false);
    expect(canReturnDrawToBowl(null, at(60_000))).toBe(false);
  });
});
