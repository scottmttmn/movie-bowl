import { tmdbFetch } from "./tmdb.js";
import { AVAILABLE_STREAMING_SERVICES, normalizeServiceName } from "../../src/utils/streamingServices.js";

// Which of a person's movies are on the viewer's services, answered whole
// (output/designs/streaming-aware-search.md). TMDB's discover takes a person
// and a set of providers together, so one short run of pages settles the
// complete list -- what a filter needs, where checking rows one at a time
// could only ever rank them. It matches any credit, crew included, so the
// caller intersects it with the role it is showing; "directed" stays
// `job === "Director"`.

const REGION = "US";
// The same groups a search row counts as "On Netflix": rent and buy never do.
const MONETIZATION = "flatrate|free|ads";
// Twenty a page. Ten covers anyone's filmography on a handful of services.
const MAX_PAGES = 10;
const PROVIDER_LIST_TTL_MS = 12 * 60 * 60 * 1000;

let providerList = null;

export function clearProviderListCache() {
  providerList = null;
}

// The viewer's services are names; discover wants TMDB's provider ids. Names
// are matched exactly as a search row matches them, so a title passes the
// filter only when its row would say it is on one of yours.
async function getProviderList() {
  if (providerList?.expiresAt > Date.now()) return providerList.value;
  const value = tmdbFetch(`/watch/providers/movie?language=en-US&watch_region=${REGION}`)
    .then((data) => (data?.results || []).map((provider) => ({
      id: Number(provider?.provider_id),
      service: normalizeServiceName(provider?.provider_name).toLowerCase(),
    })));
  providerList = { value, expiresAt: Date.now() + PROVIDER_LIST_TTL_MS };
  // A failed list must not stand for twelve hours.
  value.catch(() => {
    if (providerList?.value === value) providerList = null;
  });
  return value;
}

// Only services the app offers; anything else in the request is ignored.
export function parseServices(raw) {
  const known = new Map(AVAILABLE_STREAMING_SERVICES.map((service) => [service.toLowerCase(), service]));
  const services = new Set();
  for (const part of String(raw || "").split("|").slice(0, AVAILABLE_STREAMING_SERVICES.length)) {
    const service = known.get(normalizeServiceName(part).toLowerCase());
    if (service) services.add(service);
  }
  return [...services];
}

export async function findPersonMoviesOnServices(personId, services) {
  const wanted = new Set(services.map((service) => service.toLowerCase()));
  const providerIds = (await getProviderList())
    .filter((provider) => Number.isInteger(provider.id) && provider.id > 0 && wanted.has(provider.service))
    .map((provider) => provider.id);
  if (providerIds.length === 0) return [];

  const params = new URLSearchParams({
    with_people: String(personId),
    watch_region: REGION,
    with_watch_providers: [...new Set(providerIds)].join("|"),
    with_watch_monetization_types: MONETIZATION,
    include_adult: "false",
    language: "en-US",
    sort_by: "popularity.desc",
  });
  const page = (number) => tmdbFetch(`/discover/movie?${params}&page=${number}`);
  const first = await page(1);
  const pages = Math.min(Number(first?.total_pages) || 1, MAX_PAGES);
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => page(index + 2)));
  const ids = new Set();
  for (const data of [first, ...rest]) {
    for (const movie of data?.results || []) {
      if (movie?.adult !== true && Number.isInteger(Number(movie?.id))) ids.add(Number(movie.id));
    }
  }
  return [...ids];
}
