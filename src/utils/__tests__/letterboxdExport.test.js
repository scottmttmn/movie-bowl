import { describe, expect, it } from "vitest";
import {
  buildLetterboxdWatchedCsv,
  formatLocalCalendarDate,
  getLetterboxdWatchedExportFileName,
} from "../letterboxdExport";

describe("letterboxdExport", () => {
  it("builds watched import rows for movies with positive TMDB IDs", () => {
    const watchedAt = new Date(2026, 3, 12, 9, 30);

    const result = buildLetterboxdWatchedCsv([
      {
        tmdb_id: 101,
        title: "Owned Favorite",
        release_date: "2001-12-19",
        drawn_at: watchedAt,
      },
    ]);

    expect(result).toEqual({
      csv: `tmdbID,Title,Year,WatchedDate\n101,Owned Favorite,2001,${formatLocalCalendarDate(watchedAt)}`,
      exportedCount: 1,
      skippedCount: 0,
    });
  });

  it("escapes commas, quotes, and newlines in titles", () => {
    const result = buildLetterboxdWatchedCsv([
      {
        tmdb_id: 202,
        title: "Movie, \"The One\"\nNight",
        release_date: "2026-01-01",
        drawn_at: new Date(2026, 0, 2, 10),
      },
    ]);

    expect(result.csv).toContain('202,"Movie, ""The One""\nNight",2026,2026-01-02');
  });

  it("skips custom entries and preserves duplicate exportable movies", () => {
    const result = buildLetterboxdWatchedCsv([
      { tmdb_id: 303, title: "Repeat", release_date: "1999-01-01", drawn_at: new Date(2026, 4, 1) },
      { tmdb_id: null, title: "Wildcard Night", release_date: "2026-01-01", drawn_at: new Date(2026, 4, 2) },
      { tmdb_id: -42, title: "Custom Choice", release_date: "2026-01-01", drawn_at: new Date(2026, 4, 3) },
      { tmdb_id: 303, title: "Repeat", release_date: "1999-01-01", drawn_at: new Date(2026, 4, 4) },
    ]);

    expect(result.exportedCount).toBe(2);
    expect(result.skippedCount).toBe(2);
    expect(result.csv.match(/^303,Repeat,1999,/gm)).toHaveLength(2);
  });

  it("formats export file names with the local calendar date", () => {
    expect(getLetterboxdWatchedExportFileName(new Date(2026, 6, 2))).toBe(
      "movie-bowl-letterboxd-watched-2026-07-02.csv"
    );
  });
});
