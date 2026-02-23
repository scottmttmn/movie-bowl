const SERVICE_ALIASES = {
  "amazon prime video": "Prime Video",
  "prime video": "Prime Video",
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

export function uniqueNormalizedServices(services) {
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

export function matchUserServices(availableServices, userServices) {
  const normalizedUserServices = new Set(
    uniqueNormalizedServices(userServices).map((service) => service.toLowerCase())
  );

  return uniqueNormalizedServices(availableServices).filter((service) =>
    normalizedUserServices.has(service.toLowerCase())
  );
}
