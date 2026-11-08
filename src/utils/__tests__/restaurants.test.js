import { describe, expect, it } from "vitest";
import { countSlips, getRestaurantDirectionsUrl, normalizeBowlKind, normalizeCuisine } from "../restaurants";

describe("restaurant helpers", () => {
  it("treats anything unknown as a movie bowl, so a newer kind cannot break an older client", () => {
    expect(normalizeBowlKind("restaurants")).toBe("restaurants");
    expect(normalizeBowlKind(undefined)).toBe("movies");
    expect(normalizeBowlKind("games")).toBe("movies");
  });

  it("tidies a cuisine and keeps an empty one out of the table", () => {
    expect(normalizeCuisine("  Thai   food ")).toBe("Thai food");
    expect(normalizeCuisine("   ")).toBeNull();
    expect(normalizeCuisine("x".repeat(60))).toHaveLength(40);
  });

  it("opens the exact place when Google gave one, and searches by name otherwise", () => {
    const byName = new URL(getRestaurantDirectionsUrl({ title: "Great Dragon" }));
    expect(byName.searchParams.get("query")).toBe("Great Dragon");
    expect(byName.searchParams.has("query_place_id")).toBe(false);
    const byPlace = new URL(getRestaurantDirectionsUrl({ title: "La Rana", place_id: "ChIJ1" }));
    expect(byPlace.searchParams.get("query_place_id")).toBe("ChIJ1");
    expect(getRestaurantDirectionsUrl({ title: " " })).toBeNull();
  });

  it("counts in the bowl's own word", () => {
    expect(countSlips("restaurants", 1)).toBe("1 restaurant");
    expect(countSlips("movies", 3)).toBe("3 movies");
  });
});
