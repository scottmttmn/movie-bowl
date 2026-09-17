const RELEASE_TYPE_LABELS = {
  1: "Premiere",
  2: "Limited theatrical",
  3: "Theatrical",
  4: "Digital",
  5: "Physical",
  6: "TV",
};

const STATUS_LABELS = {
  canceled: "Canceled",
  cancelled: "Canceled",
  rumored: "Rumored",
  planned: "Planned",
  "in production": "In production",
  "post production": "Post-production",
};

function parseTmdbDate(value) {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatReleaseDate(date, locale) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function getRegionalReleaseRows(movie, region) {
  const result = (movie?.release_dates?.results || []).find(
    (entry) => String(entry?.iso_3166_1 || "").toUpperCase() === region
  );
  const rows = [];
  const seen = new Set();

  (result?.release_dates || []).forEach((release) => {
    const date = parseTmdbDate(release?.release_date);
    const type = Number(release?.type);
    if (!date || !RELEASE_TYPE_LABELS[type]) return;

    const key = `${type}:${date.toISOString().slice(0, 10)}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      type,
      typeLabel: RELEASE_TYPE_LABELS[type],
      date,
      certification: String(release?.certification || "").trim() || null,
    });
  });

  return rows.sort((left, right) => left.date - right.date || left.type - right.type);
}

export function getMovieReleaseStatus(
  movie,
  { region = "US", now = new Date(), locale = "en-US" } = {}
) {
  const normalizedRegion = String(region || "US").toUpperCase();
  const currentDate = now instanceof Date ? now : new Date(now);
  const statusKey = String(movie?.status || "").trim().toLowerCase();
  const statusLabel = STATUS_LABELS[statusKey] || null;
  const normalizedState = statusKey === "cancelled" ? "canceled" : statusKey;
  const regionalRows = getRegionalReleaseRows(movie, normalizedRegion);
  const primaryDate = parseTmdbDate(movie?.release_date);
  const nextRegionalRelease = regionalRows.find((release) => release.date > currentDate);
  const isUpcoming = Boolean(
    (primaryDate && primaryDate > currentDate) || nextRegionalRelease
  );
  const nextRelease = nextRegionalRelease ||
    (primaryDate && primaryDate > currentDate
      ? { type: null, typeLabel: "Coming", date: primaryDate, certification: null }
      : null);
  const label = statusLabel ||
    (nextRelease
      ? `${nextRelease.typeLabel} ${formatReleaseDate(nextRelease.date, locale)}`
      : null);

  return {
    state: normalizedState || (isUpcoming ? "upcoming" : "released"),
    label,
    isUpcoming,
    isExceptional: Boolean(statusLabel || isUpcoming),
    nextRelease: nextRelease
      ? {
          type: nextRelease.type,
          typeLabel: nextRelease.typeLabel,
          date: nextRelease.date.toISOString(),
        }
      : null,
    milestones: regionalRows.map((release) => ({
      type: release.type,
      typeLabel: release.typeLabel,
      date: release.date.toISOString(),
      label: `${release.typeLabel} ${formatReleaseDate(release.date, locale)}`,
      certification: release.certification,
    })),
  };
}

export function getSearchReleaseLabel(movie, options = {}) {
  const status = getMovieReleaseStatus(movie, options);
  if (status.isUpcoming && status.label) return status.label;
  return movie?.release_date ? String(movie.release_date).split("-")[0] : "—";
}
