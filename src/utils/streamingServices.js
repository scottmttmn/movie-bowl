export const AVAILABLE_STREAMING_SERVICES = [
  "Netflix",
  "Hulu",
  "Disney+",
  "Prime Video",
  "Max",
  "Apple TV+",
  "Paramount+",
  "Peacock",
  "Crunchyroll",
  "AMC+",
  "Starz",
  "Showtime",
  "MUBI",
  "The Criterion Channel",
  "Tubi",
  "Pluto TV",
  "The Roku Channel",
  "Kanopy",
];

const SERVICE_ALIASES = {
  "amazon prime video": "Prime Video",
  "prime video": "Prime Video",
  "hbo max": "Max",
  "max": "Max",
  "apple tv plus": "Apple TV+",
  "apple tv+": "Apple TV+",
  "paramount plus": "Paramount+",
  "paramount+": "Paramount+",
  "peacock premium": "Peacock",
  "the criterion channel": "The Criterion Channel",
  "criterion channel": "The Criterion Channel",
  "mubi": "MUBI",
  "amc plus": "AMC+",
  "amc+": "AMC+",
  "starz": "Starz",
  "showtime": "Showtime",
  "crunchyroll": "Crunchyroll",
  "tubi": "Tubi",
  "pluto tv": "Pluto TV",
  "the roku channel": "The Roku Channel",
  "kanopy": "Kanopy",
  "disney plus": "Disney+",
  "disney+": "Disney+",
  "netflix": "Netflix",
  "hulu": "Hulu",
};

export function normalizeServiceName(name) {
  if (!name || typeof name !== "string") return "";
  const normalized = name.trim().toLowerCase();
  return SERVICE_ALIASES[normalized] || name.trim();
}

export function normalizeStreamingServices(services) {
  const seen = new Set();
  const result = [];

  (services || []).forEach((service) => {
    const normalized = normalizeServiceName(service);
    if (!normalized) return;

    const key = normalized.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    result.push(normalized);
  });

  return result;
}

export function uniqueNormalizedServices(services) {
  return normalizeStreamingServices(services);
}

export function normalizeStreamingServicesForProfile(services) {
  return normalizeStreamingServices(services);
}

export function matchUserServices(availableServices, userServices) {
  const normalizedUserServices = new Set(
    normalizeStreamingServices(userServices).map((service) => service.toLowerCase())
  );

  return normalizeStreamingServices(availableServices).filter((service) =>
    normalizedUserServices.has(service.toLowerCase())
  );
}
