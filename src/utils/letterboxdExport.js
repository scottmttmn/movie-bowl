const LETTERBOXD_WATCHED_COLUMNS = ["tmdbID", "Title", "Year", "WatchedDate"];

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

export function formatLocalCalendarDate(value) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
}

function getReleaseYear(value) {
  const match = String(value ?? "").match(/^(\d{4})/);
  return match?.[1] ?? "";
}

function isPositiveTmdbId(value) {
  const tmdbId = Number(value);
  return Number.isInteger(tmdbId) && tmdbId > 0;
}

function escapeCsvField(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;

  return `"${text.replaceAll('"', '""')}"`;
}

function buildCsvLine(values) {
  return values.map(escapeCsvField).join(",");
}

export function buildLetterboxdWatchedCsv(movies = []) {
  const exportableMovies = (movies || []).filter((movie) => isPositiveTmdbId(movie?.tmdb_id));
  const skippedCount = (movies || []).length - exportableMovies.length;
  const lines = [buildCsvLine(LETTERBOXD_WATCHED_COLUMNS)];

  exportableMovies.forEach((movie) => {
    lines.push(
      buildCsvLine([
        Number(movie.tmdb_id),
        movie.title ?? "",
        getReleaseYear(movie.release_date),
        formatLocalCalendarDate(movie.drawn_at),
      ])
    );
  });

  return {
    csv: lines.join("\n"),
    exportedCount: exportableMovies.length,
    skippedCount,
  };
}

export function getLetterboxdWatchedExportFileName(date = new Date()) {
  return `movie-bowl-letterboxd-watched-${formatLocalCalendarDate(date)}.csv`;
}
