import { describe, expect, it } from "vitest";
import { buildSearchMarks, formatWatchedSpoken, formatWatchedStub, getSearchMark } from "../searchMarks";

const bowls = [
  { id: "friday", name: "Friday Night" },
  { id: "late", name: "Late Shift" },
  { id: "family", name: "Mom & Dad" },
];
const slip = (bowl_id, tmdb_id, added_by = "me", extra = {}) => ({ bowl_id, tmdb_id, added_by, starter_pack: false, ...extra });
const mark = (options, id) => getSearchMark(buildSearchMarks({ bowlId: "friday", userId: "me", bowls, ...options }), { id });

describe("search marks", () => {
  it("takes the + away from your own slip in this bowl", () => {
    expect(mark({ slips: [slip("friday", 10)] }, 10)).toEqual({ kind: "in_bowl", owner: "mine", blocksAdd: true });
  });

  // One slip per title per bowl today, so someone else's copy blocks the add
  // too. The owner is kept apart for when each person may hold their own slip.
  it("marks someone else's slip as theirs, and still blocks the add while one slip per title holds", () => {
    expect(mark({ slips: [slip("friday", 10, "casey")] }, 10)).toEqual({ kind: "in_bowl", owner: "theirs", blocksAdd: true });
    expect(mark({ slips: [slip("friday", 10, "casey"), slip("friday", 10)] }, 10).owner).toBe("mine");
  });

  it("leaves a starter pack title addable, because adding it is how you claim it", () => {
    expect(mark({ slips: [slip("friday", 10, null, { starter_pack: true })] }, 10)).toBeNull();
  });

  it("dates a title from your latest viewing and keeps its +", () => {
    const watchEvents = [{ tmdb_id: 10, watched_on: "2025-03-02" }, { tmdb_id: 10, watched_on: "2026-01-05" }];
    expect(mark({ watchEvents }, 10)).toEqual({ kind: "watched", watchedOn: "2026-01-05", blocksAdd: false });
  });

  it("names the first other bowl holding the title, in picker order", () => {
    const result = mark({ slips: [slip("family", 10, "casey"), slip("late", 10)] }, 10);
    expect(result).toEqual({ kind: "other_bowl", bowl: bowls[1], blocksAdd: false });
  });

  it("ignores slips in bowls you no longer have", () => {
    expect(mark({ slips: [slip("gone", 10)] }, 10)).toBeNull();
  });

  it("shows the strongest mark: this bowl, then watched, then another bowl", () => {
    const watchEvents = [{ tmdb_id: 10, watched_on: "2026-01-05" }];
    expect(mark({ slips: [slip("late", 10), slip("friday", 10)], watchEvents }, 10).kind).toBe("in_bowl");
    expect(mark({ slips: [slip("late", 10)], watchEvents }, 10).kind).toBe("watched");
  });

  it("never matches a custom title, which has no real film behind it", () => {
    expect(mark({ slips: [slip("friday", -4)], watchEvents: [{ tmdb_id: -4, watched_on: "2026-01-05" }] }, -4)).toBeNull();
  });

  it("matches a movie by tmdb_id before id", () => {
    const marks = buildSearchMarks({ bowlId: "friday", userId: "me", bowls, slips: [slip("friday", 10)] });
    expect(getSearchMark(marks, { id: "row-uuid", tmdb_id: 10 })?.kind).toBe("in_bowl");
  });
});

describe("watched dates", () => {
  const now = new Date(2026, 8, 30);

  it("gives the day this year and the month before", () => {
    expect(formatWatchedStub("2026-01-05", now)).toBe(new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(2026, 0, 5)));
    expect(formatWatchedStub("2024-11-20", now)).toBe(new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(new Date(2024, 10, 20)));
  });

  // Parsed as ISO, "2026-01-05" is UTC midnight, which is January 4 in America.
  it("reads the date as a local calendar day", () => {
    expect(formatWatchedSpoken("2026-01-05")).toBe(new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(new Date(2026, 0, 5)));
    expect(formatWatchedStub("not a date", now)).toBeNull();
  });
});
