import { describe, expect, it } from "vitest";
import {
  BEST_PICTURE_WINNERS,
  STARTER_PACKS,
  bestPictureWinnersFor,
  choosePackPerson,
  getStarterPack,
  matchBestPictureWinner,
  selectFilmographyCandidates,
} from "../starterPacks";

const credit = (overrides) => ({
  id: 1, title: "A Film", release_date: "1985-06-01", vote_count: 500, genre_ids: [18], billing: 0, ...overrides,
});

describe("starter pack definitions", () => {
  it("gives every pack a unique slug and a name that says its decade", () => {
    const slugs = STARTER_PACKS.map((pack) => pack.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(getStarterPack("spielberg-1980s")).toMatchObject({ name: "Spielberg: The '80s", role: "directing", decade: 1980 });
    expect(getStarterPack("best-picture-1990s")).toMatchObject({ name: "Best Picture Winners: The '90s", kind: "best-picture" });
    expect(getStarterPack("not-a-pack")).toBeNull();
  });

  it("lists one Best Picture winner a year, in order, by the year of the film", () => {
    const years = BEST_PICTURE_WINNERS.map((winner) => winner.year);
    expect(years).toEqual(Array.from({ length: years.length }, (_, index) => 1950 + index));
    expect(bestPictureWinnersFor(1990).map((winner) => winner.title)).toContain("Schindler's List");
    expect(bestPictureWinnersFor(1990)).toHaveLength(10);
  });
});

describe("choosePackPerson", () => {
  const pack = getStarterPack("spielberg-1980s");

  it("takes the one person with the pack's exact name", () => {
    const result = choosePackPerson(pack, [
      { id: 488, name: "Steven Spielberg", known_for_department: "Directing" },
      { id: 9, name: "Steven Spielberger", known_for_department: "Acting" },
    ]);
    expect(result.person.id).toBe(488);
  });

  it("settles two people with one name by the pack's role, and otherwise refuses to guess", () => {
    const both = [
      { id: 1, name: "Steven Spielberg", known_for_department: "Directing" },
      { id: 2, name: "Steven Spielberg", known_for_department: "Sound" },
    ];
    expect(choosePackPerson(pack, both).person.id).toBe(1);
    expect(choosePackPerson(pack, [both[0], { ...both[0], id: 3 }]).error).toMatch(/More than one/);
    expect(choosePackPerson(pack, []).error).toMatch(/No one named/);
  });
});

describe("selectFilmographyCandidates", () => {
  it("keeps the pack's role and decade, above the vote floor, without documentaries", () => {
    const pack = getStarterPack("spielberg-1980s");
    const directing = [
      credit({ id: 1, title: "Kept" }),
      credit({ id: 2, title: "Wrong decade", release_date: "1993-06-11" }),
      credit({ id: 3, title: "Barely seen", vote_count: 12 }),
      credit({ id: 4, title: "A documentary", genre_ids: [99] }),
      credit({ id: 5, title: "No date", release_date: null }),
    ];
    expect(selectFilmographyCandidates(pack, { acting: [], directing }).map((movie) => movie.title)).toEqual(["Kept"]);
  });

  it("keeps only top-billed parts for an acting pack", () => {
    const pack = getStarterPack("hanks-1990s");
    const acting = [
      credit({ id: 1, title: "Lead", release_date: "1994-07-06", billing: 0 }),
      credit({ id: 2, title: "Third billed", release_date: "1995-01-01", billing: 2 }),
      credit({ id: 3, title: "Cameo", release_date: "1996-01-01", billing: 14 }),
      credit({ id: 4, title: "Unknown billing", release_date: "1997-01-01", billing: null }),
    ];
    expect(selectFilmographyCandidates(pack, { acting, directing: [] }).map((movie) => movie.title))
      .toEqual(["Lead", "Third billed"]);
  });
});

describe("matchBestPictureWinner", () => {
  const winner = { title: "Crash", year: 2005 };

  it("takes the film with the exact title from the winner's year, not a namesake", () => {
    const result = matchBestPictureWinner(winner, [
      { id: 1, title: "Crash", release_date: "1996-10-04" },
      { id: 2, title: "Crash", release_date: "2005-05-06" },
      { id: 3, title: "Crash Test", release_date: "2005-01-01" },
    ]);
    expect(result.movie.id).toBe(2);
  });

  it("allows a year either side when the release date drifted", () => {
    const result = matchBestPictureWinner(winner, [{ id: 2, title: "Crash", release_date: "2004-09-10" }]);
    expect(result.movie.id).toBe(2);
  });

  it("refuses rather than guesses between two films of one title and year", () => {
    expect(matchBestPictureWinner(winner, [
      { id: 1, title: "Crash", release_date: "2005-01-01" },
      { id: 2, title: "Crash", release_date: "2005-06-01" },
    ]).error).toMatch(/More than one/);
    expect(matchBestPictureWinner(winner, []).error).toMatch(/was not found/);
  });

  it("matches through punctuation and the original title", () => {
    expect(matchBestPictureWinner({ title: "Oliver!", year: 1968 }, [
      { id: 7, title: "Oliver", release_date: "1968-09-26" },
    ]).movie.id).toBe(7);
    expect(matchBestPictureWinner({ title: "Parasite", year: 2019 }, [
      { id: 8, title: "기생충", original_title: "Parasite", release_date: "2019-05-30" },
    ]).movie.id).toBe(8);
  });
});
