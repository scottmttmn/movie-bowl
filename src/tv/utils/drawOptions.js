/**
 * Builds the account/device filter view used by both TV draw surfaces.
 *
 * The television deliberately does not expose genre, rating, or runtime
 * controls. Those follow the account; the room-level streaming overrides are
 * already present in `settings` by the time this helper runs.
 */
export function getAvailableDrawGenres(movies) {
  return [
    ...new Set(
      (movies || []).flatMap((movie) =>
        (movie?.genres || [])
          .map((genre) => (typeof genre === "string" ? genre : genre?.name))
          .filter(Boolean)
      )
    ),
  ].sort((left, right) => left.localeCompare(right));
}

export function buildTvDrawOptions(settings, streamingServices, availableGenres) {
  const drawSettings = settings || {};
  const selectedGenres = Array.isArray(drawSettings.selectedGenres)
    ? drawSettings.selectedGenres.filter((genre) => availableGenres.includes(genre))
    : availableGenres;

  return {
    prioritizeByServices: Boolean(drawSettings.prioritizeStreaming),
    prioritizeByServiceRank: Boolean(drawSettings.useStreamingRank),
    userStreamingServices: streamingServices,
    ratingFilter: {
      allowedRatings: drawSettings.selectedRatings || [],
      includeUnknown: Boolean(drawSettings.includeUnknownRatings),
    },
    genreFilter: {
      allowedGenres: selectedGenres,
      includeUnknown: Boolean(drawSettings.includeUnknownGenres),
    },
    runtimeFilter: {
      minMinutes: Number(drawSettings.runtimeMinMinutes || 0),
      maxMinutes: Number(drawSettings.runtimeMaxMinutes || 500),
      includeUnknown: Boolean(drawSettings.includeUnknownRuntime),
    },
  };
}
