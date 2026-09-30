import { describe, expect, it } from "vitest";
import { describeGenres, describeRatings, describeRuntime, formatMinutes } from "../filterSummaries";
import { MPAA_RATING_OPTIONS } from "../movieRatings";
import { RUNTIME_FILTER_MAX_MINUTES, RUNTIME_FILTER_MIN_MINUTES } from "../drawSettings";

describe("filterSummaries", () => {
  it("formats minutes the way people say them", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(120)).toBe("2 hr");
    expect(formatMinutes(90)).toBe("1 hr 30 min");
  });

  it("says Any for an untouched filter", () => {
    expect(describeRatings(MPAA_RATING_OPTIONS, true)).toBe("Any rating");
    expect(describeGenres(null, ["Drama"], true)).toBe("Any genre");
    expect(describeRuntime(RUNTIME_FILTER_MIN_MINUTES, RUNTIME_FILTER_MAX_MINUTES)).toBe("Any length");
  });

  it("names narrowed ratings in rating order, with unrated when it is kept", () => {
    expect(describeRatings(["PG-13", "G", "PG"], true)).toBe("G, PG, PG-13 or unrated");
    expect(describeRatings(["R"], false)).toBe("R");
    expect(describeRatings(MPAA_RATING_OPTIONS, false)).toBe("Rated only");
    expect(describeRatings([], true)).toBe("Unrated only");
    expect(describeRatings([], false)).toBe("None");
  });

  it("lists up to three genres in the sheet's order and counts beyond that", () => {
    const available = ["Action", "Comedy", "Drama", "Horror"];
    expect(describeGenres(["Drama", "Action"], available, false)).toBe("Action, Drama");
    expect(describeGenres(["Drama", "Action", "Comedy", "Horror"], available, false)).toBe("4 genres");
    expect(describeGenres(["Drama"], available, true)).toBe("Drama or uncategorized");
    expect(describeGenres([], available, false)).toBe("None");
  });

  it("reads a runtime range as a bound or a span", () => {
    expect(describeRuntime(RUNTIME_FILTER_MIN_MINUTES, 120, false)).toBe("Up to 2 hr");
    expect(describeRuntime(90, RUNTIME_FILTER_MAX_MINUTES, false)).toBe("At least 1 hr 30 min");
    expect(describeRuntime(90, 150, false)).toBe("1 hr 30 min to 2 hr 30 min");
    expect(describeRuntime(RUNTIME_FILTER_MIN_MINUTES, 120, true)).toBe("Up to 2 hr or unknown");
  });

  it("says when titles with no length or genre data are left out or kept", () => {
    expect(describeRuntime(RUNTIME_FILTER_MIN_MINUTES, RUNTIME_FILTER_MAX_MINUTES, false)).toBe("Known lengths only");
    expect(describeGenres(null, [], false)).toBe("Listed genres only");
  });
});
