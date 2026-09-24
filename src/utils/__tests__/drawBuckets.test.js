import { describe, expect, it } from "vitest";
import {
  getContributorBucketKey,
  isStarterPackMovie,
  getMovieAttributionAccent,
  getMovieAttributionLabel,
  getMovieAttributionLine,
} from "../drawBuckets";

describe("drawBuckets", () => {
  it("gives a starter pack slip no bucket, and knows it by its marker rather than its name", () => {
    const packSlip = { added_by: null, added_by_name: "Nolan: The '00s", starter_pack: "nolan-2000s" };
    const namesake = { added_by: null, added_by_name: "Nolan: The '00s" };

    expect(isStarterPackMovie(packSlip)).toBe(true);
    expect(getContributorBucketKey(packSlip)).toBeNull();
    expect(isStarterPackMovie(namesake)).toBe(false);
    expect(getContributorBucketKey(namesake)).toBe("guest:nolan: the '00s");
    // The reveal names the pack where it would name a person.
    expect(getMovieAttributionLabel(packSlip)).toBe("Nolan: The '00s");
    expect(getMovieAttributionLine(packSlip)).toBe("From the Nolan: The '00s pack");
    expect(getMovieAttributionLine(namesake)).toBe("Added by Nolan: The '00s");
    expect(getMovieAttributionLine({ added_by: null })).toBeNull();
  });

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
