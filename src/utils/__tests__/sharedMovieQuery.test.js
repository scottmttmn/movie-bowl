import { describe, expect, it } from "vitest";
import { getSharedMovieQuery } from "../sharedMovieQuery";

describe("getSharedMovieQuery", () => {
  it("keeps the title from a browser share and drops the site and year", () => {
    expect(getSharedMovieQuery({ title: "Sinners (2025) - IMDb", text: "https://m.imdb.com/title/tt31193180/" })).toBe("Sinners");
    expect(getSharedMovieQuery({ title: "Sinners | Rotten Tomatoes" })).toBe("Sinners");
    expect(getSharedMovieQuery({ title: "Sinners (2025 film) - Wikipedia" })).toBe("Sinners");
    expect(getSharedMovieQuery({ title: "SINNERS | Official Trailer - YouTube" })).toBe("SINNERS");
  });

  it("drops Letterboxd's credits and the invisible mark it leads with", () => {
    expect(getSharedMovieQuery({
      title: "‎Sinners (2025) directed by Ryan Coogler • Reviews, film + cast • Letterboxd",
      text: "https://letterboxd.com/film/sinners-2025/",
    })).toBe("Sinners");
  });

  it("keeps a separator that belongs to the title", () => {
    expect(getSharedMovieQuery({ title: "Mission: Impossible - Fallout (2018) - IMDb" })).toBe("Mission: Impossible - Fallout");
  });

  it("reads an app's share text around its link", () => {
    expect(getSharedMovieQuery({ text: "Sinners (2025) - IMDb https://www.imdb.com/title/tt31193180/" })).toBe("Sinners");
    expect(getSharedMovieQuery({ text: "Check out \"Sinners\" on Netflix https://www.netflix.com/title/81234" })).toBe("Sinners");
  });

  it("falls back to the words in a bare link, but not an opaque id", () => {
    expect(getSharedMovieQuery({ text: "https://letterboxd.com/film/sinners-2025/" })).toBe("sinners");
    expect(getSharedMovieQuery({ url: "https://en.wikipedia.org/wiki/Sinners_(2025_film)" })).toBe("Sinners");
    expect(getSharedMovieQuery({ title: "IMDb", text: "https://www.imdb.com/title/tt0111161/" })).toBe("");
  });

  it("leaves a description for smart search to read", () => {
    expect(getSharedMovieQuery({ text: "that vampire movie with michael b jordan" })).toBe("that vampire movie with michael b jordan");
  });

  it("prefers an explicit q and is empty when nothing came in", () => {
    expect(getSharedMovieQuery({ q: "Heat", title: "Something else" })).toBe("Heat");
    expect(getSharedMovieQuery({})).toBe("");
    expect(getSharedMovieQuery()).toBe("");
  });

  it("caps a long share", () => {
    expect(getSharedMovieQuery({ text: "word ".repeat(100) }).length).toBeLessThanOrEqual(120);
  });
});
