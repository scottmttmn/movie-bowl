import { describe, expect, it } from "vitest";
import { getMovieIdentityLabel } from "../movieIdentity";

describe("getMovieIdentityLabel", () => {
  it("hides redundant English identity metadata", () => {
    expect(getMovieIdentityLabel({
      title: "Arrival",
      original_title: "Arrival",
      original_language: "en",
    })).toBe("");
  });

  it("shows a different original title and translated language name", () => {
    expect(getMovieIdentityLabel({
      title: "Amelie",
      original_title: "Le Fabuleux Destin d'Amélie Poulain",
      original_language: "fr",
    })).toBe("Original: Le Fabuleux Destin d'Amélie Poulain · French");
  });

  it("shows a non-English language even when the title is unchanged", () => {
    expect(getMovieIdentityLabel({
      title: "Roma",
      original_title: "Roma",
      original_language: "es",
    })).toBe("Spanish");
  });
});
