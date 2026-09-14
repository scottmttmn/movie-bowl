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

  // TMDB lists newest first, which for an older film is usually an
  // anniversary campaign. These are The Godfather's rows as TMDB returns them.
  it("prefers the original trailer over an anniversary re-release", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "50th", name: "50th Anniversary Trailer", published_at: "2022-01-13T17:00:00.000Z" },
      { site: "YouTube", type: "Teaser", official: true, iso_639_1: "en", key: "45th", name: "45th Anniversary Spot", published_at: "2017-05-12T16:00:00.000Z" },
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "original", name: "Original Trailer", published_at: "2012-03-27T17:00:00.000Z" },
    ]);

    expect(trailer).toMatchObject({ key: "original" });
  });

  it("ranks a re-release below an original teaser", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "restored", name: "4K Restoration Trailer", published_at: "2010-01-01T00:00:00.000Z" },
      { site: "YouTube", type: "Teaser", official: true, iso_639_1: "en", key: "teaser", name: "Teaser", published_at: "2020-01-01T00:00:00.000Z" },
    ]);

    expect(trailer).toMatchObject({ key: "teaser" });
  });

  // The Matrix's rows: every official trailer but one names an anniversary.
  it("reads a 4K upload as a re-upload rather than a re-release", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "25th", name: "25th Anniversary Official Trailer", published_at: "2024-04-26T00:00:00.000Z" },
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "4k", name: "Official 4K Trailer", published_at: "2021-05-26T00:00:00.000Z" },
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "20th", name: "20th Anniversary UK Trailer", published_at: "2019-06-28T00:00:00.000Z" },
    ]);

    expect(trailer).toMatchObject({ key: "4k" });
  });

  it("falls back to a re-release when it is the only trailer", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "reissue", name: "Re-release Trailer" },
    ]);

    expect(trailer).toMatchObject({ key: "reissue" });
  });

  // Star Wars' rows as TMDB lists them. Lucasfilm uploaded the re-release
  // trailer a year before the original teaser, so the upload date points the wrong
  // way and TMDB's own order has to stand.
  it("does not treat the earliest upload as the original", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "teaser", name: "Teaser Trailer", published_at: "2013-10-09T00:00:00.000Z" },
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "special", name: "Trailer", published_at: "2012-07-05T00:00:00.000Z" },
    ]);

    expect(trailer).toMatchObject({ key: "teaser" });
  });

  // The Empire Strikes Back's official rows, newest first.
  it("prefers a theatrical trailer over a digital release and a plain re-upload", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "digital", name: "The Empire Strikes Back - Star Wars: The Digital Movie Collection" },
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "theatrical", name: "Theatrical Trailer #2" },
      { site: "YouTube", type: "Teaser", official: true, iso_639_1: "en", key: "teaser", name: "Teaser Trailer" },
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "special", name: "Trailer" },
    ]);

    expect(trailer).toMatchObject({ key: "theatrical" });
  });

  // Ghost's rows. Unofficial uploads that survive the fan-edit filter and name
  // themselves the theatrical cut are archive scans -- the actual trailer --
  // where the official anniversary trailer is a different one.
  it("prefers an unofficial original over an official re-release", () => {
    const trailer = selectBestTrailer(
      [
        { site: "YouTube", type: "Trailer", official: false, iso_639_1: "en", key: "scan", name: "Ghost (1990) Theatrical Trailer [4K] [FTD-0895]" },
        { site: "YouTube", type: "Teaser", official: true, iso_639_1: "en", key: "tcm", name: "TCM Big Screen Classics Spot" },
        { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "30th", name: "30th Anniversary Official Trailer" },
      ],
      { releaseDate: "1990-07-13", title: "Ghost" }
    );

    expect(trailer).toMatchObject({ key: "scan", official: false });
  });

  it("still prefers an official trailer with no sign of re-release over an unofficial original", () => {
    const trailer = selectBestTrailer(
      [
        { site: "YouTube", type: "Trailer", official: false, iso_639_1: "en", key: "scan", name: "Original Theatrical Trailer" },
        { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "official", name: "Trailer" },
      ],
      { releaseDate: "1990-07-13" }
    );

    expect(trailer).toMatchObject({ key: "official" });
  });

  // Barbie's rows, newest first. TMDB types the promo as Trailer.
  it("ranks named promos below anything that calls itself a trailer", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Teaser", official: true, iso_639_1: "en", key: "max", name: "Streaming Exclusively on Max" },
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "ken", name: "Just Ken Exclusive" },
      { site: "YouTube", type: "Teaser", official: true, iso_639_1: "en", key: "dream", name: "Dream" },
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "main", name: "Main Trailer" },
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "teaser", name: "Teaser Trailer" },
    ]);

    expect(trailer).toMatchObject({ key: "main" });
  });

  it("ranks a TV spot below a trailer even when TMDB types both as trailers", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "spot", name: "Extended Red Band TV Spot" },
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "trailer", name: "Official Trailer" },
    ]);

    expect(trailer).toMatchObject({ key: "trailer" });
  });

  it("still plays a promo when it is all there is", () => {
    const trailer = selectBestTrailer([
      { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "promo", name: "Special Look" },
    ]);

    expect(trailer).toMatchObject({ key: "promo" });
  });

  describe("with the film's release date", () => {
    // Bridget Jones's Diary's rows.
    it("reads a year after release as a re-release", () => {
      const trailer = selectBestTrailer(
        [
          { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "2022", name: "Official 2022 Trailer" },
          { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "plain", name: "Bridget Jones's Diary - Trailer" },
        ],
        { releaseDate: "2001-04-13", title: "Bridget Jones's Diary" }
      );

      expect(trailer).toMatchObject({ key: "plain" });
    });

    // The Nightmare Before Christmas's rows: the international cut came a year
    // later, so only the release year itself marks the original.
    it("reads the release year itself as the original", () => {
      const trailer = selectBestTrailer(
        [
          { site: "YouTube", type: "Trailer", official: false, iso_639_1: "en", key: "1994", name: "The Nightmare Before Christmas - 1994 International Trailer (35mm 4K)" },
          { site: "YouTube", type: "Trailer", official: false, iso_639_1: "en", key: "1993", name: "1993 Theatrical Trailer" },
          { site: "YouTube", type: "Trailer", official: false, iso_639_1: "en", key: "sneak", name: "1993 Sneak Peek Trailer" },
        ],
        { releaseDate: "1993-10-09", title: "The Nightmare Before Christmas" }
      );

      expect(trailer).toMatchObject({ key: "1993" });
    });

    it("does not mistake a year in the film's own title for a re-release", () => {
      const trailer = selectBestTrailer(
        [
          { site: "YouTube", type: "Teaser", official: true, iso_639_1: "en", key: "teaser", name: "Teaser" },
          { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "trailer", name: "2001: A Space Odyssey - Trailer" },
        ],
        { releaseDate: "1968-04-02", title: "2001: A Space Odyssey" }
      );

      expect(trailer).toMatchObject({ key: "trailer" });
    });

    // Finding Nemo's 3D trailer was uploaded for its 2012 re-release; Green
    // Lantern's was cut for its first run.
    it("counts 3D and IMAX against a video only when it was uploaded well after release", () => {
      const nemo = selectBestTrailer(
        [
          { site: "YouTube", type: "Trailer", official: false, iso_639_1: "en", key: "original", name: "Finding Nemo (2003) Trailer 2", published_at: "2018-02-11T00:00:00.000Z" },
          { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "3d", name: "Finding Nemo 3D Trailer", published_at: "2012-05-23T00:00:00.000Z" },
        ],
        { releaseDate: "2003-05-30", title: "Finding Nemo" }
      );
      const lantern = selectBestTrailer(
        [
          { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "3d", name: "3D Trailer", published_at: "2011-05-23T00:00:00.000Z" },
          { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "plain", name: "Trailer", published_at: "2011-05-04T00:00:00.000Z" },
        ],
        { releaseDate: "2011-06-14", title: "Green Lantern" }
      );

      expect(nemo).toMatchObject({ key: "original" });
      expect(lantern).toMatchObject({ key: "3d" });
    });

    it("ranks without years when the release date is missing", () => {
      const trailer = selectBestTrailer([
        { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "2022", name: "Official 2022 Trailer" },
        { site: "YouTube", type: "Trailer", official: true, iso_639_1: "en", key: "plain", name: "Trailer" },
      ]);

      expect(trailer).toMatchObject({ key: "2022" });
    });
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
