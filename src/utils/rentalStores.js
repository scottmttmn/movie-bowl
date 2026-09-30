// Stores that rent movies, as the "Rent from" setting names them. They are
// deliberately not streaming services: a title you would have to pay for is
// never in the draw pool, so these live apart from AVAILABLE_STREAMING_SERVICES
// and nothing here may feed matchUserServices.
export const RENTAL_STORES = [
  "Apple TV",
  "Prime Video",
  "Fandango at Home",
  "Google Play",
  "YouTube",
];

export const RENT_FROM_ANY = "any";
export const RENT_FROM_OFF = "off";

// Watchmode, TMDB and links cached before stores had their own names all spell
// these differently. "Apple TV+" and "Prime Video" are how a rent link was
// labelled while rentals were filed under the matching streaming service.
const RENTAL_STORE_ALIASES = {
  "apple tv": "Apple TV",
  "apple tv+": "Apple TV",
  "apple tv store": "Apple TV",
  appletv: "Apple TV",
  itunes: "Apple TV",
  amazon: "Prime Video",
  "amazon video": "Prime Video",
  "amazon prime": "Prime Video",
  "prime video": "Prime Video",
  "fandango at home": "Fandango at Home",
  fandangoathome: "Fandango at Home",
  vudu: "Fandango at Home",
  "google play": "Google Play",
  "google play movies": "Google Play",
  "google play movies & tv": "Google Play",
  youtube: "YouTube",
};

export function normalizeRentalStore(name) {
  if (typeof name !== "string") return null;
  return RENTAL_STORE_ALIASES[name.trim().toLowerCase()] || null;
}

export function normalizeRentFrom(value) {
  if (value === RENT_FROM_OFF) return RENT_FROM_OFF;
  return RENTAL_STORES.includes(value) ? value : RENT_FROM_ANY;
}

// The Google TV app hands a link to an installed app only for the hosts it
// knows (getProviderPackageName in tv-android's MainActivity). Of these stores
// that is Apple TV and Prime Video; any other link would go looking for a
// browser a television does not have. Adding a store here needs the shell to
// learn its app first.
const TV_APP_RENTAL_HOSTS = {
  "Apple TV": "tv.apple.com",
  "Prime Video": "amazon.com",
};

export function isTvAppRentalLink({ storeName, url }) {
  const host = TV_APP_RENTAL_HOSTS[storeName];
  if (!host) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === host || hostname.endsWith(`.${host}`);
  } catch {
    return false;
  }
}
