import { afterEach, describe, expect, it, vi } from "vitest";
import { readSectionOpen, writeSectionOpen } from "../sectionVisibility";

describe("sectionVisibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("starts both bowl page sections closed on a new device", () => {
    expect(readSectionOpen("myMovies", "u1")).toBe(false);
    expect(readSectionOpen("watched", "u1")).toBe(false);
  });

  it("remembers each section separately", () => {
    writeSectionOpen("myMovies", true, "u1");
    expect(readSectionOpen("myMovies", "u1")).toBe(true);
    expect(readSectionOpen("watched", "u1")).toBe(false);

    writeSectionOpen("watched", true, "u1");
    writeSectionOpen("myMovies", false, "u1");
    expect(readSectionOpen("myMovies", "u1")).toBe(false);
    expect(readSectionOpen("watched", "u1")).toBe(true);
  });

  it("keeps each account's choice to that account", () => {
    writeSectionOpen("myMovies", true, "u1");
    expect(readSectionOpen("myMovies", "u2")).toBe(false);
  });

  it("remembers nothing without a signed-in account", () => {
    writeSectionOpen("myMovies", true, null);
    expect(readSectionOpen("myMovies", null)).toBe(false);
    expect(window.localStorage.length).toBe(0);
  });

  it("falls back to the defaults when storage is unreadable or unavailable", () => {
    window.localStorage.setItem("movieBowl.sections.v1:u1", "{not json");
    expect(readSectionOpen("myMovies", "u1")).toBe(false);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeSectionOpen("myMovies", true, "u1")).not.toThrow();
    expect(readSectionOpen("myMovies", "u1")).toBe(false);
  });
});
