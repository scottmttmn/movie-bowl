import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AWAY_TTL_MS,
  filterPresentMovies,
  isOnlyMeHere,
  readAwayKeys,
  readSkipAsk,
  writeAwayKeys,
  writeSkipAsk,
} from "../whoIsHere";

describe("whoIsHere", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps the slips of the people here, pack titles and link guests", () => {
    const movies = [
      { id: 1, added_by: "u1" },
      { id: 2, added_by: "u2" },
      { id: 3, added_by: null, added_by_name: "Jo" },
      { id: 4, added_by: "u2", starter_pack: "best-picture" },
    ];
    expect(filterPresentMovies(movies, ["user:u2"]).map((movie) => movie.id)).toEqual([1, 3, 4]);
    expect(filterPresentMovies(movies, [])).toBe(movies);
    expect(filterPresentMovies(null, ["user:u2"])).toEqual([]);
  });

  it("knows when only you are here", () => {
    const members = ["user:me", "user:a", "user:b"];
    expect(isOnlyMeHere(members, ["user:a", "user:b"], "user:me")).toBe(true);
    expect(isOnlyMeHere(members, ["user:a"], "user:me")).toBe(false);
    expect(isOnlyMeHere(members, ["user:a", "user:b", "user:me"], "user:me")).toBe(false);
    expect(isOnlyMeHere(["user:me"], [], "user:me")).toBe(false);
  });

  it("remembers an absence for the evening, per account and bowl", () => {
    writeAwayKeys("me", "bowl-1", ["user:a"], 1000);
    expect(readAwayKeys("me", "bowl-1", 1000 + AWAY_TTL_MS)).toEqual(["user:a"]);
    expect(readAwayKeys("me", "bowl-1", 1001 + AWAY_TTL_MS)).toEqual([]);
    expect(readAwayKeys("me", "bowl-2", 1000)).toEqual([]);
    expect(readAwayKeys("someone-else", "bowl-1", 1000)).toEqual([]);
  });

  it("remembers not asking until it is undone, alongside the absences", () => {
    writeAwayKeys("me", "bowl-1", ["user:a"]);
    writeSkipAsk("me", "bowl-1", true);
    expect(readSkipAsk("me", "bowl-1")).toBe(true);
    expect(readAwayKeys("me", "bowl-1")).toEqual(["user:a"]);
    writeSkipAsk("me", "bowl-1", false);
    expect(readSkipAsk("me", "bowl-1")).toBe(false);
  });

  it("asks and counts everyone when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => writeAwayKeys("me", "bowl-1", ["user:a"])).not.toThrow();
    expect(readAwayKeys("me", "bowl-1")).toEqual([]);
    expect(readSkipAsk("me", "bowl-1")).toBe(false);
  });
});
