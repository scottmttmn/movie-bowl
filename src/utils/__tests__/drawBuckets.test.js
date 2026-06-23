import { describe, expect, it } from "vitest";
import {
  buildDrawOddsStats,
  getContributorBucketKey,
  getMovieAttributionLabel,
} from "../drawBuckets";

describe("drawBuckets", () => {
  it("uses added_by for bucket identity and added_by_name for movie attribution", () => {
    const movie = {
      added_by: "user-1",
      added_by_name: "Dad",
      profiles: { email: "owner@example.com" },
    };

    expect(getContributorBucketKey(movie)).toBe("user:user-1");
    expect(getMovieAttributionLabel(movie)).toBe("Dad");
  });

  it("reports equal odds per non-empty contributor bucket with movie counts", () => {
    expect(
      buildDrawOddsStats([
        { id: "m1", added_by: "user-1", profiles: { email: "owner@example.com" } },
        { id: "m2", added_by: "user-1", added_by_name: "Dad", profiles: { email: "owner@example.com" } },
        { id: "m3", added_by: "user-2", profiles: { email: "friend@example.com" } },
      ])
    ).toEqual([
      {
        bucketKey: "user:user-2",
        member: "friend@example.com",
        movieCount: 1,
        drawOdds: 0.5,
      },
      {
        bucketKey: "user:user-1",
        member: "owner@example.com",
        movieCount: 2,
        drawOdds: 0.5,
      },
    ]);
  });
});
