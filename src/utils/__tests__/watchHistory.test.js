import { describe, expect, it } from "vitest";
import {
  canReturnDrawToBowl,
  describePlannedReturnDay,
  getReturnDeadline,
  RETURN_UNDO_WINDOW_MS,
} from "../watchHistory";

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

describe("a draw made for a later day", () => {
  // Wednesday, November 11, 2026, 5:30 PM local, drawn for Saturday.
  const drawn = new Date(2026, 10, 11, 17, 30);
  const saturdayEnd = new Date(2026, 10, 15);
  const planned = { drawn_at: drawn.toISOString(), return_until: saturdayEnd.toISOString() };

  it("stays returnable until the end of that day, and no longer", () => {
    expect(getReturnDeadline(planned)).toBe(saturdayEnd.getTime());
    expect(canReturnDrawToBowl(planned, new Date(2026, 10, 14, 23, 59).getTime())).toBe(true);
    expect(canReturnDrawToBowl(planned, saturdayEnd.getTime() + 1)).toBe(false);
  });

  it("never shortens the ordinary two hours", () => {
    const early = { drawn_at: drawn.toISOString(), return_until: drawn.toISOString() };
    expect(getReturnDeadline(early)).toBe(drawn.getTime() + RETURN_UNDO_WINDOW_MS);
    expect(describePlannedReturnDay(early, drawn.getTime())).toBeNull();
  });

  it("names the day it was drawn for, counted from now", () => {
    expect(describePlannedReturnDay(planned, drawn.getTime())).toBe("Saturday");
    expect(describePlannedReturnDay(planned, new Date(2026, 10, 13, 9).getTime())).toBe("tomorrow");
    expect(describePlannedReturnDay(planned, new Date(2026, 10, 14, 9).getTime())).toBe("today");
    const tonight = { drawn_at: drawn.toISOString(), return_until: new Date(2026, 10, 12).toISOString() };
    expect(describePlannedReturnDay(tonight, drawn.getTime())).toBe("today");
    expect(describePlannedReturnDay({ drawn_at: drawn.toISOString() }, drawn.getTime())).toBeNull();
  });
});
