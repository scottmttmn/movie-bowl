import { describe, expect, it } from "vitest";
import { getBackdropUrl } from "../getBackdropUrl";

describe("getBackdropUrl", () => {
  it("builds a sized TMDB backdrop URL", () => {
    expect(getBackdropUrl({ backdrop_path: "/fight-club.jpg" }))
      .toBe("https://image.tmdb.org/t/p/w1280/fight-club.jpg");
    expect(getBackdropUrl({ backdrop_path: "/fight-club.jpg" }, "original"))
      .toBe("https://image.tmdb.org/t/p/original/fight-club.jpg");
  });

  it("returns null when the movie has no backdrop", () => {
    expect(getBackdropUrl({})).toBeNull();
  });
});
