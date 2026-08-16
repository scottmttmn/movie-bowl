import { describe, expect, it } from "vitest";
import { getDrawablePoolMovies, summarizeContributorReach } from "../drawPool";

const alexA = { id: "a", added_by: "user-1", profiles: { email: "alex@example.com" } };
const alexB = { id: "b", added_by: "user-1", profiles: { email: "alex@example.com" } };
const sam = { id: "c", added_by: "user-2", profiles: { email: "sam@example.com" } };
const guest = { id: "d", added_by: null, added_by_name: "Jo" };

describe("getDrawablePoolMovies", () => {
  it("drops rows that have not persisted yet", () => {
    const movies = [alexA, { id: "temp", local_status: "syncing", added_by: "user-9" }];
    expect(getDrawablePoolMovies(movies)).toEqual([alexA]);
  });
});

describe("summarizeContributorReach", () => {
  it("counts every contributor as reached when nothing is filtered out", () => {
    const pool = [alexA, alexB, sam];
    expect(summarizeContributorReach(pool, pool)).toEqual({
      totalCount: 2,
      reachedCount: 2,
      excludedNames: [],
    });
  });

  it("names the contributors the filtered pool cannot reach", () => {
    const pool = [alexA, alexB, sam, guest];

    expect(summarizeContributorReach(pool, [alexA])).toEqual({
      totalCount: 3,
      reachedCount: 1,
      excludedNames: ["Jo", "sam"],
    });
  });

  // Losing some of your titles is not the same as being shut out of the draw.
  it("still counts a contributor as reached when only some titles survive", () => {
    const pool = [alexA, alexB, sam];

    expect(summarizeContributorReach(pool, [alexA, sam])).toEqual({
      totalCount: 2,
      reachedCount: 2,
      excludedNames: [],
    });
  });

  it("counts contributors it cannot name", () => {
    const unnamed = { id: "e", added_by: "user-3" };
    const pool = [alexA, unnamed];

    const reach = summarizeContributorReach(pool, [alexA]);
    expect(reach.totalCount).toBe(2);
    expect(reach.reachedCount).toBe(1);
    expect(reach.excludedNames).toEqual([]);
  });

  it("reports everyone as excluded when the pool is empty", () => {
    const pool = [alexA, sam];

    expect(summarizeContributorReach(pool, [])).toEqual({
      totalCount: 2,
      reachedCount: 0,
      excludedNames: ["alex", "sam"],
    });
  });
});
