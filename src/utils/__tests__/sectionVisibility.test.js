import { afterEach, describe, expect, it, vi } from "vitest";
import { readSectionOpen, writeSectionOpen } from "../sectionVisibility";

describe("sectionVisibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("starts both bowl page sections closed on a new device", () => {
    expect(readSectionOpen("myMovies")).toBe(false);
    expect(readSectionOpen("watched")).toBe(false);
  });

  it("remembers each section separately", () => {
    writeSectionOpen("myMovies", true);
    expect(readSectionOpen("myMovies")).toBe(true);
    expect(readSectionOpen("watched")).toBe(false);

    writeSectionOpen("watched", true);
    writeSectionOpen("myMovies", false);
    expect(readSectionOpen("myMovies")).toBe(false);
    expect(readSectionOpen("watched")).toBe(true);
  });

  it("falls back to the defaults when storage is unreadable or unavailable", () => {
    window.localStorage.setItem("movieBowl.sections.v1", "{not json");
    expect(readSectionOpen("myMovies")).toBe(false);

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeSectionOpen("myMovies", true)).not.toThrow();
    expect(readSectionOpen("myMovies")).toBe(false);
  });
});
