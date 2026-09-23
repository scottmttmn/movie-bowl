import { describe, expect, it } from "vitest";
import { queryMatchesName, selectStrongPeopleMatches } from "../peopleMatch";

const person = (name, popularity, extra = {}) => ({ id: name.length, name, popularity, ...extra });

describe("queryMatchesName", () => {
  it("matches when every typed word starts a word of the name", () => {
    expect(queryMatchesName("tom han", "Tom Hanks")).toBe(true);
    expect(queryMatchesName("hanks", "Tom Hanks")).toBe(true);
    expect(queryMatchesName("Hanks Tom", "Tom Hanks")).toBe(true);
  });

  it("does not match a word buried inside a name", () => {
    expect(queryMatchesName("anks", "Tom Hanks")).toBe(false);
    expect(queryMatchesName("tom hanks jr", "Tom Hanks")).toBe(false);
  });

  it("ignores case, accents and punctuation", () => {
    expect(queryMatchesName("penelope", "Penélope Cruz")).toBe(true);
    expect(queryMatchesName("o'brien", "Conan O'Brien")).toBe(true);
  });
});

describe("selectStrongPeopleMatches", () => {
  it("returns nothing for a query under three characters", () => {
    expect(selectStrongPeopleMatches("to", [person("Tom Hanks", 60)])).toEqual([]);
  });

  it("holds back an obscure namesake below the popularity floor", () => {
    const matches = selectStrongPeopleMatches("tom han", [
      person("Tom Hanks", 60),
      person("Tom Hankinson", 0.4),
    ]);
    expect(matches.map((match) => match.name)).toEqual(["Tom Hanks"]);
  });

  it("keeps a title search clean when the only name it starts is obscure", () => {
    // "big" does start "Bigg"; the popularity floor is what keeps the title
    // search Big from growing a row of strangers.
    expect(selectStrongPeopleMatches("big", [person("Bigg Smalls", 0.8)])).toEqual([]);
  });

  it("keeps at most three, most popular first, and never adult entries", () => {
    const matches = selectStrongPeopleMatches("washington", [
      person("John David Washington", 18),
      person("Denzel Washington", 45),
      person("Kerry Washington", 20),
      person("Isaiah Washington", 9),
      person("Washington Adult", 99, { adult: true }),
    ]);
    expect(matches.map((match) => match.name)).toEqual([
      "Denzel Washington",
      "Kerry Washington",
      "John David Washington",
    ]);
  });
});
