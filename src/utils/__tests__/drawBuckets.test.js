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
      profiles: { display_name: "Owner" },
    };

    expect(getContributorBucketKey(movie)).toBe("user:user-1");
    expect(getMovieAttributionLabel(movie)).toBe("Dad");
  });

  it("uses display names and never treats an email as shared identity", () => {
    expect(getMovieAttributionLabel({
      added_by: "user-1234",
      profiles: { display_name: "Casey", email: "casey@example.com" },
    })).toBe("Casey");
    expect(getMovieAttributionLabel({
      added_by: "user-1234",
      profiles: { email: "casey@example.com" },
    })).toBe("Member 1234");
  });

  it("keeps an accent stable for the actual named contributor", () => {
    const danMovie = { added_by: "link-creator-a", added_by_name: "Dan" };
    const anotherDanMovie = { added_by: "link-creator-b", added_by_name: "Dan" };

    expect(getMovieAttributionAccent(danMovie)).toEqual(getMovieAttributionAccent(danMovie));
    expect(getMovieAttributionAccent(danMovie)).toEqual(getMovieAttributionAccent(anotherDanMovie));
  });
});
