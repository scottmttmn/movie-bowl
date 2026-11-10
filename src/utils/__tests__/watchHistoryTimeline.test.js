import { describe, expect, it } from "vitest";
import { getWatchedDate, getWatchedYears, groupWatchHistoryByMonth } from "../watchHistoryTimeline";

const row = (id, watchedOn) => ({ id, watchedDate: getWatchedDate(watchedOn) });

describe("watchHistoryTimeline", () => {
  it("reads a date-only value as that local day", () => {
    const date = getWatchedDate("2026-11-08");
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 10, 8]);
    expect(getWatchedDate(null)).toBeNull();
    expect(getWatchedDate("not a date")).toBeNull();
  });

  it("lists the years watched, newest first", () => {
    expect(getWatchedYears([row(1, "2025-01-02"), row(2, "2026-03-04"), row(3, "2026-05-06"), { id: 4 }])).toEqual([
      2026, 2025,
    ]);
  });

  it("groups by month and then by day, keeping the order given", () => {
    const groups = groupWatchHistoryByMonth([
      row("a", "2026-11-08"),
      row("b", "2026-11-08"),
      row("c", "2026-11-06"),
      row("d", "2026-10-30"),
      { id: "undated" },
    ]);

    expect(groups.map((group) => [group.movieCount, group.dayGroups.map((day) => day.dateTime)])).toEqual([
      [3, ["2026-11-08", "2026-11-06"]],
      [1, ["2026-10-30"]],
    ]);
    expect(groups[0].dayGroups[0].movies.map((movie) => movie.id)).toEqual(["a", "b"]);
    expect(groups[0].dayGroups[0].dayNumber).toBe(8);
  });
});
