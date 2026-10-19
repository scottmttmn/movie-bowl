import { normalizeServiceName } from "../../src/utils/streamingServices.js";
import { MOVIE_OF_THE_NIGHT_SERVICE_IDS } from "../../src/utils/titleDepartures.js";

// Only base subscriptions/free catalogs count. A Prime or Apple channel
// expiring does not mean the movie is leaving Prime Video or Apple TV+.
export function normalizeTitleDepartures(show, tmdbId, now = Date.now()) {
  if (
    show?.showType !== "movie" ||
    show.tmdbId !== `movie/${tmdbId}` ||
    !show.streamingOptions ||
    typeof show.streamingOptions !== "object"
  ) {
    throw new Error("Invalid departure response");
  }
  const options = show.streamingOptions.us || [];
  if (!Array.isArray(options)) throw new Error("Invalid departure response");
  const byService = new Map();
  for (const option of options) {
    if (!["subscription", "free"].includes(option?.type) || option.addon) continue;
    const service = MOVIE_OF_THE_NIGHT_SERVICE_IDS[option.service?.id];
    if (!service || normalizeServiceName(option.service?.name) !== service) continue;
    const group = byService.get(service) || [];
    const timestamp = option.expiresOn;
    const expiresAt = Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp * 1000 : null;
    group.push({ expiresAt, expiring: option.expiresSoon === true || expiresAt !== null });
    byService.set(service, group);
  }
  return [...byService].flatMap(([service, group]) => {
    // Another included option with no announced departure can keep it available.
    if (group.some((option) => !option.expiring)) return [];
    const expiresAt = group.every((option) => option.expiresAt !== null)
      ? Math.max(...group.map((option) => option.expiresAt))
      : null;
    if (expiresAt !== null && (expiresAt <= now || expiresAt > now + 31 * 86400000)) return [];
    return [{ service, expiresOn: expiresAt === null ? null : new Date(expiresAt).toISOString() }];
  });
}

export async function fetchTitleDepartures(tmdbId) {
  const response = await fetch(
    `https://api.movieofthenight.com/v4/shows/${encodeURIComponent(`movie/${tmdbId}`)}?country=us`,
    {
      headers: { "X-API-Key": process.env.MOVIE_OF_THE_NIGHT_API_KEY },
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    },
  );
  if (response.status === 404) return [];
  if (!response.ok) {
    const error = new Error("Departure lookup failed");
    error.statusCode = response.status;
    throw error;
  }
  return normalizeTitleDepartures(await response.json(), tmdbId);
}
