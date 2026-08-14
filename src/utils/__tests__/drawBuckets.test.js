import { describe, expect, it } from "vitest";
import {
  getContributorBucketKey,
  getMovieAttributionAccent,
  getMovieAttributionLabel,
} from "../drawBuckets";

describe("drawBuckets", () => {
  it("uses added_by for bucket identity and added_by_name for movie attribution", () => {
    const movie = {
      added_by: "user-1",
      added_by_name: "Dad",
      profiles: { email: "owner@example.com" },
    };

    expect(getContributorBucketKey(movie)).toBe("user:user-1");
    expect(getMovieAttributionLabel(movie)).toBe("Dad");
  });

  it("keeps an accent stable for the actual named contributor", () => {
    const danMovie = { added_by: "link-creator-a", added_by_name: "Dan" };
    const anotherDanMovie = { added_by: "link-creator-b", added_by_name: "Dan" };

    expect(getMovieAttributionAccent(danMovie)).toEqual(getMovieAttributionAccent(danMovie));
    expect(getMovieAttributionAccent(danMovie)).toEqual(getMovieAttributionAccent(anotherDanMovie));
  });
});
