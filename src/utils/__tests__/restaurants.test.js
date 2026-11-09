import { describe, expect, it } from "vitest";
import {
  countSlips,
  filterSlipsByCuisine,
  getCuisineChoices,
  getRestaurantDirectionsUrl,
  inBowlWords,
  normalizeBowlKind,
  normalizeCuisine,
} from "../restaurants";

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

  it("offers only the cuisines the bowl holds, in the add sheet's order, with Other last", () => {
    const slips = [{ cuisine: "Thai" }, { cuisine: "Pizza" }, { cuisine: "Ramen" }, { cuisine: null }, { cuisine: "Pizza" }];
    expect(getCuisineChoices(slips)).toEqual(["Pizza", "Thai", "Other"]);
    expect(getCuisineChoices(null)).toEqual([]);
  });

  it("leaves out only the cuisines named, so one added later is in the draw", () => {
    const slips = [
      { id: 1, cuisine: "Pizza" },
      { id: 2, cuisine: "Thai" },
      { id: 3, cuisine: "Ramen" },
      { id: 4, cuisine: "Mexican" },
    ];
    expect(filterSlipsByCuisine(slips, null)).toBe(slips);
    expect(filterSlipsByCuisine(slips, { excluded: ["Thai", "Other"] }).map((slip) => slip.id)).toEqual([1, 4]);
  });

  it("reads movie copy in a restaurant bowl's word and leaves a movie bowl's alone", () => {
    expect(inBowlWords("restaurants", "One of their movies")).toBe("One of their restaurants");
    expect(inBowlWords("restaurants", "Random movie, more titles")).toBe("Random restaurant, more restaurants");
    expect(inBowlWords("restaurants", "Movie night")).toBe("Restaurant night");
    expect(inBowlWords("restaurants", "Welcome to Movie Bowl. This bowl draws title-first."))
      .toBe("Welcome to Movie Bowl. This bowl draws title-first.");
    expect(inBowlWords("movies", "One of their movies")).toBe("One of their movies");
    expect(inBowlWords("restaurants", null)).toBeNull();
  });
});
