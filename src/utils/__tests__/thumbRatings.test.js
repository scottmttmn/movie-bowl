import { describe, expect, it } from "vitest";
import {
  getEntryRating,
  groupBowlRatings,
  indexRatings,
  normalizeRating,
  withEntryRating,
} from "../thumbRatings";

describe("thumbRatings", () => {
  it("accepts only the four thumbs, and never a zero", () => {
    expect([-2, -1, 1, 2, "2"].map(normalizeRating)).toEqual([-2, -1, 1, 2, 2]);
    expect([0, 3, null, undefined, "love"].map(normalizeRating)).toEqual([null, null, null, null, null]);
  });

  it("shares one rating across every viewing of a TMDB movie", () => {
    const index = indexRatings([{ tmdb_id: 655, watch_event_id: null, rating: 2 }]);

    expect(getEntryRating(index, { id: "first", tmdb_id: 655 })).toBe(2);
    expect(getEntryRating(index, { id: "rewatch", tmdb_id: "655" })).toBe(2);
    expect(getEntryRating(index, { id: "other", tmdb_id: 11046 })).toBeNull();
  });

  it("rates a custom title by the entry it was rated on", () => {
    const index = indexRatings([{ tmdb_id: null, watch_event_id: "custom-1", rating: -1 }]);

    expect(getEntryRating(index, { id: "custom-1", tmdb_id: -7 })).toBe(-1);
    expect(getEntryRating(index, { id: "custom-2", tmdb_id: -7 })).toBeNull();
  });

  it("sets and clears a rating without touching the index it was given", () => {
    const index = indexRatings([]);
    const rated = withEntryRating(index, { id: "a", tmdb_id: 655 }, 1);
    const cleared = withEntryRating(rated, { id: "b", tmdb_id: 655 }, null);

    expect(getEntryRating(index, { id: "a", tmdb_id: 655 })).toBeNull();
    expect(getEntryRating(rated, { id: "a", tmdb_id: 655 })).toBe(1);
    expect(getEntryRating(cleared, { id: "a", tmdb_id: 655 })).toBeNull();
  });

  it("groups a bowl's thumbs by draw, yours apart from the others'", () => {
    const groups = groupBowlRatings([
      { draw_event_id: "d1", user_id: "me", display_name: "Scott", rating: 2, is_self: true },
      { draw_event_id: "d1", user_id: "robin", display_name: "Robin", rating: 1, is_self: false },
      { draw_event_id: "d1", user_id: "casey", display_name: "Casey", rating: -1, is_self: false },
      { draw_event_id: "d2", user_id: "robin", display_name: "Robin", rating: null, is_self: false },
    ]);

    expect(groups.get("d1")).toEqual({
      mine: 2,
      others: [
        { userId: "casey", name: "Casey", rating: -1 },
        { userId: "robin", name: "Robin", rating: 1 },
      ],
    });
    // Face down: the database said Robin rated d2, not what she picked.
    expect(groups.get("d2")).toEqual({ mine: null, others: [{ userId: "robin", name: "Robin", rating: null }] });
  });
});
