import { matchUserServices } from "./streamingServices.js";

// US base catalogs supported by both the vendor and the app. Keep IDs from
// the vendor's country/service list, rather than guessing from display names.
export const MOVIE_OF_THE_NIGHT_SERVICE_IDS = {
  netflix: "Netflix",
  hulu: "Hulu",
  disney: "Disney+",
  prime: "Prime Video",
  hbo: "Max",
  apple: "Apple TV+",
  paramount: "Paramount+",
  peacock: "Peacock",
  crunchyroll: "Crunchyroll",
  amc: "AMC+",
  starz: "Starz",
  mubi: "MUBI",
  criterion: "The Criterion Channel",
  tubi: "Tubi",
  plutotv: "Pluto TV",
  roku: "The Roku Channel",
};

const supportedServices = new Set(Object.values(MOVIE_OF_THE_NIGHT_SERVICE_IDS));

export function matchDepartureServices(providers, services) {
  return matchUserServices(providers, services).filter((service) => supportedServices.has(service));
}

export function relevantDepartures(departures, providers, services, now = Date.now()) {
  const matches = matchDepartureServices(providers, services);
  return (Array.isArray(departures) ? departures : [])
    .filter(
      (departure) =>
        matches.includes(departure?.service) &&
        (departure.expiresOn === null || Date.parse(departure.expiresOn) > now),
    )
    .sort((a, b) => (Date.parse(a.expiresOn) || Infinity) - (Date.parse(b.expiresOn) || Infinity));
}

export function departureLabel(departure) {
  if (!departure.expiresOn) return `Leaving ${departure.service} soon`;
  // Keep the vendor's expiry instant and use the viewer's local calendar date,
  // as the other dates in movie details do.
  const date = new Date(departure.expiresOn).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `Expected to leave ${departure.service} ${date}`;
}
