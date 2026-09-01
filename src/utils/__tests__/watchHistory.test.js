import { describe, expect, it } from "vitest";
import {
  belongsInBowlWatchHistory,
  isWithinReturnHistoryCleanupWindow,
} from "../watchHistory";

const DRAWN_AT = "2026-09-01T12:00:00.000Z";

describe("watch history return timing", () => {
  it("treats the exact two-hour boundary as an undo", () => {
    const returnedAt = "2026-09-01T14:00:00.000Z";

    expect(isWithinReturnHistoryCleanupWindow({ drawn_at: DRAWN_AT }, returnedAt)).toBe(
      true
    );
    expect(
      belongsInBowlWatchHistory({ drawn_at: DRAWN_AT, returned_at: returnedAt })
    ).toBe(false);
  });

  it("keeps an older returned draw in bowl Watch History", () => {
    const returnedAt = "2026-09-01T14:00:00.001Z";

    expect(isWithinReturnHistoryCleanupWindow({ drawn_at: DRAWN_AT }, returnedAt)).toBe(
      false
    );
    expect(
      belongsInBowlWatchHistory({ drawn_at: DRAWN_AT, returned_at: returnedAt })
    ).toBe(true);
  });

  it("keeps active draws and malformed returned records visible", () => {
    expect(belongsInBowlWatchHistory({ drawn_at: DRAWN_AT, returned_at: null })).toBe(
      true
    );
    expect(
      belongsInBowlWatchHistory({ drawn_at: null, returned_at: "2026-09-01T15:00:00Z" })
    ).toBe(true);
  });
});
