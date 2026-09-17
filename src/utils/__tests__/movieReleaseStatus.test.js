import { describe, expect, it } from "vitest";
import { getMovieReleaseStatus, getSearchReleaseLabel } from "../movieReleaseStatus";

const now = new Date("2026-09-16T12:00:00.000Z");

describe("movieReleaseStatus", () => {
  it("keeps ordinary released movies quiet", () => {
    expect(getMovieReleaseStatus({ status: "Released", release_date: "1999-10-15" }, { now }))
      .toMatchObject({ label: null, isUpcoming: false, isExceptional: false });
    expect(getSearchReleaseLabel({ release_date: "1999-10-15" }, { now })).toBe("1999");
  });

  it("uses the next exact US release type and date", () => {
    const movie = {
      status: "Post Production",
      release_date: "2026-11-01",
      release_dates: {
        results: [
          {
            iso_3166_1: "US",
            release_dates: [
              { type: 3, release_date: "2026-10-23T00:00:00.000Z" },
              { type: 4, release_date: "2026-11-18T00:00:00.000Z" },
            ],
          },
        ],
      },
    };

    const result = getMovieReleaseStatus(movie, { now });
    expect(result).toMatchObject({
      label: "Post-production",
      isUpcoming: true,
      isExceptional: true,
      nextRelease: { type: 3, typeLabel: "Theatrical" },
    });
    expect(result.milestones.map((milestone) => milestone.label)).toEqual([
      "Theatrical Oct 23, 2026",
      "Digital Nov 18, 2026",
    ]);
  });

  it("labels a search-only future date without details metadata", () => {
    expect(getSearchReleaseLabel({ release_date: "2026-12-04" }, { now }))
      .toBe("Coming Dec 4, 2026");
  });

  it("surfaces canceled titles without blocking them", () => {
    expect(getMovieReleaseStatus({ status: "Canceled" }, { now })).toMatchObject({
      state: "canceled",
      label: "Canceled",
      isExceptional: true,
    });
    expect(getMovieReleaseStatus({ status: "Cancelled" }, { now })).toMatchObject({
      state: "canceled",
      label: "Canceled",
    });
  });
});
