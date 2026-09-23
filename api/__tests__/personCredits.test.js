import { describe, expect, it } from "vitest";
import { normalizePersonMovieCredits } from "../_lib/personCredits.js";

describe("normalizePersonMovieCredits", () => {
  it("keeps every credited feature role, including small parts", () => {
    const { acting } = normalizePersonMovieCredits({
      cast: [
        { id: 1, title: "Lead Role", character: "Hero", popularity: 50 },
        { id: 2, title: "Small Part", character: "Man at bar", popularity: 5 },
      ],
    });
    expect(acting.map((movie) => movie.title)).toEqual(["Lead Role", "Small Part"]);
  });

  it("drops uncredited, adult, direct-to-video and TV movie credits", () => {
    const { acting, directing } = normalizePersonMovieCredits({
      cast: [
        { id: 1, title: "Kept", character: "Herself", popularity: 5, genre_ids: [18] },
        { id: 2, title: "Cameo", character: "Himself (uncredited)", popularity: 50 },
        { id: 3, title: "Adult", character: "X", adult: true, popularity: 50 },
        { id: 4, title: "Video", character: "Y", video: true, popularity: 50 },
        { id: 5, title: "TV Movie", character: "Z", popularity: 50, genre_ids: [10770, 18] },
      ],
      crew: [{ id: 6, title: "Directed for TV", job: "Director", popularity: 50, genre_ids: [10770] }],
    });
    expect(acting.map((movie) => movie.title)).toEqual(["Kept"]);
    expect(directing).toEqual([]);
  });

  it("merges two characters in one movie into one row", () => {
    const { acting } = normalizePersonMovieCredits({
      cast: [
        { id: 1, title: "Twins", character: "Brother A", popularity: 5 },
        { id: 1, title: "Twins", character: "Brother B", popularity: 5 },
      ],
    });
    expect(acting).toHaveLength(1);
    expect(acting[0].characters).toEqual(["Brother A", "Brother B"]);
  });

  it("counts only credits whose job is Director as directing", () => {
    const { directing } = normalizePersonMovieCredits({
      crew: [
        { id: 1, title: "Directed", job: "Director", popularity: 5 },
        { id: 1, title: "Directed", job: "Director", popularity: 5 },
        { id: 2, title: "Produced", job: "Producer", popularity: 50 },
        { id: 3, title: "Second unit", job: "Second Unit Director", popularity: 50 },
      ],
    });
    expect(directing.map((movie) => movie.title)).toEqual(["Directed"]);
  });

  it("orders popular first, then newest, then by id", () => {
    const { acting } = normalizePersonMovieCredits({
      cast: [
        { id: 3, title: "C", popularity: 10, release_date: "2001-01-01" },
        { id: 1, title: "A", popularity: 10, release_date: "2010-01-01" },
        { id: 2, title: "B", popularity: 90, release_date: "1990-01-01" },
        { id: 0, title: "invalid id", popularity: 99 },
      ],
    });
    expect(acting.map((movie) => movie.title)).toEqual(["B", "A", "C"]);
  });
});
