import { describe, expect, it } from "vitest";
import { selectBestTrailer } from "../selectTrailer";

describe("selectBestTrailer", () => {
  it("picks the official English YouTube trailer when available", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "fr", key: "fr123", name: "Bande-annonce" },
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "en123", name: "Official Trailer" },
    ]);

    expect(trailer).toMatchObject({
      key: "en123",
      site: "YouTube",
      official: true,
      type: "Trailer",
      embedUrl: "https://www.youtube.com/embed/en123",
    });
  });

  it("falls back to any official language when English is unavailable", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "es", key: "es123", name: "Trailer Oficial" },
    ]);

    expect(trailer).toMatchObject({ key: "es123" });
  });

  it("falls back to an official teaser when no trailer is flagged", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Teaser", official: true, iso_639_1: "en", key: "teaser123", name: "Teaser" },
    ]);

    expect(trailer).toMatchObject({ key: "teaser123", type: "Teaser", official: true });
  });

  it("prefers an official teaser over an unflagged trailer", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: false, iso_639_1: "en", key: "unflagged", name: "Trailer" },
      { site: "YouTube", type: "Teaser", official: true, iso_639_1: "en", key: "teaser123", name: "Teaser" },
    ]);

    expect(trailer).toMatchObject({ key: "teaser123" });
  });

  it("accepts an unflagged trailer when nothing official exists", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: false, iso_639_1: "en", key: "unflagged", name: "Theatrical Trailer" },
    ]);

    expect(trailer).toMatchObject({ key: "unflagged", official: false });
  });

  it("prefers an unflagged trailer over an unflagged teaser", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Teaser", official: false, iso_639_1: "en", key: "teaser123", name: "Teaser" },
      { site: "YouTube", type: "Trailer", official: false, iso_639_1: "en", key: "unflagged", name: "Trailer" },
    ]);

    expect(trailer).toMatchObject({ key: "unflagged" });
  });

  it("keeps the first video TMDB lists within a tier", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "first", name: "Official Trailer" },
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "second", name: "Official Trailer 2" },
    ]);

    expect(trailer).toMatchObject({ key: "first" });
  });

  it("declines an unflagged video whose name advertises a fan edit", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: false, iso_639_1: "en", key: "fan123", name: "Concept Trailer" },
      { site: "YouTube", type: "Trailer", official: false, iso_639_1: "en", key: "honest", name: "Honest Trailers" },
    ]);

    expect(trailer).toBeNull();
  });

  it("still trusts an official video whose name trips the fan-edit words", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "review", name: "Review Trailer" },
    ]);

    expect(trailer).toMatchObject({ key: "review" });
  });

  it("ignores clips, non-YouTube videos, and keyless rows", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Clip", official: true, iso_639_1: "en", key: "clip123" },
      { site: "Vimeo", type: "Trailer", official: true, iso_639_1: "en", key: "vimeo123" },
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "   " },
    ]);

    expect(trailer).toBeNull();
  });

  it("returns null for missing or empty video lists", () => {
    expect(selectBestTrailer(undefined)).toBeNull();
    expect(selectBestTrailer([])).toBeNull();
  });
});
