import { describe, expect, it } from "vitest";
import { isWithinReturnHistoryCleanupWindow } from "../watchHistory";

const DRAWN_AT = "2026-09-01T12:00:00.000Z";

describe("watch history return timing", () => {
  it("treats the exact two-hour boundary as an undo", () => {
    expect(
      isWithinReturnHistoryCleanupWindow({ drawn_at: DRAWN_AT }, "2026-09-01T14:00:00.000Z")
    ).toBe(true);
  });

  it("treats a return past the boundary as durable personal history", () => {
    expect(
      isWithinReturnHistoryCleanupWindow({ drawn_at: DRAWN_AT }, "2026-09-01T14:00:00.001Z")
    ).toBe(false);
  });

  it("leaves personal history alone when the record is malformed", () => {
    expect(
      isWithinReturnHistoryCleanupWindow({ drawn_at: null }, "2026-09-01T13:00:00.000Z")
    ).toBe(false);
    expect(isWithinReturnHistoryCleanupWindow({ drawn_at: DRAWN_AT }, "nonsense")).toBe(
      false
    );
  });
});
