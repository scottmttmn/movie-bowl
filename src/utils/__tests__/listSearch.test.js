import { describe, expect, it } from "vitest";
import { filterByListQuery, LIST_SEARCH_THRESHOLD, matchesListQuery } from "../listSearch";

describe("list search", () => {
  it("matches any part of a title, ignoring case, accents and punctuation", () => {
    expect(matchesListQuery({ title: "Amélie" }, "AMEL")).toBe(true);
    expect(matchesListQuery({ title: "Paris, Texas" }, "paris texas")).toBe(true);
    expect(matchesListQuery({ title: "Alien: Romulus" }, "alien romulus")).toBe(true);
    expect(matchesListQuery({ title: "Heat" }, "alien")).toBe(false);
  });

  it("keeps letters from any script, so a non-Latin query still narrows", () => {
    const movies = [{ title: "千と千尋の神隠し" }, { title: "Москва слезам не верит" }, { title: "Heat" }];
    expect(filterByListQuery(movies, "千尋")).toEqual([{ title: "千と千尋の神隠し" }]);
    expect(filterByListQuery(movies, "москва")).toEqual([{ title: "Москва слезам не верит" }]);
    expect(matchesListQuery({ title: "ジブリ" }, "シフリ")).toBe(false);
  });

  it("treats an empty or blank query as everything", () => {
    const movies = [{ title: "Heat" }, { title: "Jaws" }];
    expect(filterByListQuery(movies, "")).toBe(movies);
    expect(filterByListQuery(movies, "   ")).toBe(movies);
    expect(filterByListQuery(movies, "ja")).toEqual([{ title: "Jaws" }]);
  });

  it("copes with titles and lists that are missing", () => {
    expect(matchesListQuery({ title: null }, "a")).toBe(false);
    expect(filterByListQuery(null, "a")).toEqual([]);
  });

  it("waits for a list longer than eight before offering itself", () => {
    expect(LIST_SEARCH_THRESHOLD).toBe(8);
  });
});
