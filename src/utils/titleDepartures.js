import { matchUserServices } from "./streamingServices.js";

export function relevantDepartures(departures, providers, services, now = Date.now()) {
  const matches = matchUserServices(providers, services);
  return (Array.isArray(departures) ? departures : []).filter((departure) =>
    matches.includes(departure?.service) &&
    (departure.expiresOn === null || Date.parse(departure.expiresOn) > now)
  ).sort((a, b) => (Date.parse(a.expiresOn) || Infinity) - (Date.parse(b.expiresOn) || Infinity));
}

export function departureLabel(departure) {
  if (!departure.expiresOn) return `Leaving ${departure.service} soon`;
  // Keep the vendor's expiry instant and use the viewer's local calendar date,
  // as the other dates in movie details do.
  const date = new Date(departure.expiresOn).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
  return `Expected to leave ${departure.service} ${date}`;
}
