import { describe, expect, it } from "vitest";
import { selectOfficialTrailer } from "../selectTrailer";

describe("selectOfficialTrailer", () => {
  it("picks the official English YouTube trailer when available", () => {
    const trailer = selectOfficialTrailer([
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "fr", key: "fr123", name: "Bande-annonce" },
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "en123", name: "Official Trailer" },
    ]);

    expect(trailer).toMatchObject({
      key: "en123",
      site: "YouTube",
      embedUrl: "https://www.youtube.com/embed/en123",
    });
  });

  it("falls back to any official language when English is unavailable", () => {
    const trailer = selectOfficialTrailer([
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "es", key: "es123", name: "Trailer Oficial" },
    ]);

    expect(trailer).toMatchObject({ key: "es123" });
  });

  it("ignores teasers and non-YouTube videos", () => {
    const trailer = selectOfficialTrailer([
      { site: "YouTube", type: "Teaser", official: true, iso_639_1: "en", key: "teaser123" },
      { site: "Vimeo", type: "Trailer", official: true, iso_639_1: "en", key: "vimeo123" },
    ]);

    expect(trailer).toBeNull();
  });

  it("returns null when only unofficial trailers exist", () => {
    const trailer = selectOfficialTrailer([
      { site: "YouTube", type: "Trailer", official: false, iso_639_1: "en", key: "fan123" },
    ]);

    expect(trailer).toBeNull();
  });
});

