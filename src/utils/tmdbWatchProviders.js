import { normalizeStreamingServices } from "./streamingServices.js";

export const TMDB_PROVIDER_GROUPS = [
  "subscription",
  "free",
  "ads",
  "rent",
  "buy",
];

const TMDB_GROUP_KEYS = {
  subscription: "flatrate",
  free: "free",
  ads: "ads",
  rent: "rent",
  buy: "buy",
};

const ELIGIBLE_PROVIDER_GROUPS = ["subscription", "free", "ads"];

export function createEmptyProviderAvailability() {
  return Object.fromEntries(TMDB_PROVIDER_GROUPS.map((group) => [group, []]));
}

function normalizeRegion(region) {
  const normalized = String(region || "US").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : "US";
}

function normalizeProvider(provider) {
  const name = String(provider?.name || provider?.provider_name || "").trim();
  if (!name) return null;

  const numericId = Number(provider?.id ?? provider?.provider_id);
  const numericPriority = Number(
    provider?.displayPriority ?? provider?.display_priority
  );

  return {
    id: Number.isInteger(numericId) && numericId > 0 ? numericId : null,
    name,
    logoPath: provider?.logoPath || provider?.logo_path || null,
    displayPriority:
      Number.isFinite(numericPriority) && numericPriority >= 0
        ? numericPriority
        : null,
  };
}

function normalizeProviderGroup(providers) {
  const seen = new Set();
  const normalized = [];

  (Array.isArray(providers) ? providers : []).forEach((provider) => {
    const value = normalizeProvider(provider);
    if (!value) return;

    const key = value.id ? `id:${value.id}` : `name:${value.name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(value);
  });

  return normalized;
}

export function normalizeProviderAvailability(availability) {
  const normalized = createEmptyProviderAvailability();
  TMDB_PROVIDER_GROUPS.forEach((group) => {
    normalized[group] = normalizeProviderGroup(availability?.[group]);
  });
  return normalized;
}

export function normalizeTmdbWatchProviders(
  data,
  { region = "US", fetchedAt } = {}
) {
  const normalizedRegion = normalizeRegion(region);
  const allResults = data?.["watch/providers"]?.results || data?.results;
  const regionData = allResults
    ? allResults[normalizedRegion] || {}
    : data?.region === normalizedRegion && data?.availability
      ? data
      : {};
  const availability = createEmptyProviderAvailability();

  TMDB_PROVIDER_GROUPS.forEach((group) => {
    const sourceKey = TMDB_GROUP_KEYS[group];
    availability[group] = normalizeProviderGroup(
      regionData?.availability?.[group] || regionData?.[sourceKey]
    );
  });

  const eligibleProviderRecords = ELIGIBLE_PROVIDER_GROUPS.flatMap(
    (group) => availability[group]
  );
  const providers = normalizeStreamingServices(
    eligibleProviderRecords.map((provider) => provider.name)
  );
  const providerLogos = {};

  eligibleProviderRecords.forEach((provider) => {
    const [normalizedName] = normalizeStreamingServices([provider.name]);
    if (normalizedName && provider.logoPath && !providerLogos[normalizedName]) {
      providerLogos[normalizedName] = provider.logoPath;
    }
  });

  return {
    region: normalizedRegion,
    providers,
    providerLogos,
    availability,
    watchUrl: regionData?.watchUrl || regionData?.link || null,
    fetchedAt: fetchedAt || regionData?.fetchedAt || new Date().toISOString(),
    status: "ready",
  };
}

export function normalizeStoredProviderData(providerData, options = {}) {
  const region = normalizeRegion(options.region || providerData?.region);
  const availability = normalizeProviderAvailability(providerData?.availability);
  const normalized = normalizeTmdbWatchProviders(
    {
      region,
      availability,
      watchUrl: providerData?.watchUrl || null,
      fetchedAt: providerData?.fetchedAt || null,
    },
    { region, fetchedAt: providerData?.fetchedAt || null }
  );

  if (normalized.providers.length === 0 && providerData?.providers?.length > 0) {
    normalized.providers = normalizeStreamingServices(providerData.providers);
    normalized.providerLogos = { ...(providerData?.providerLogos || {}) };
  }

  return normalized;
}

export function createEmptyStreamingProviderData(
  region = "US",
  { status = "unavailable" } = {}
) {
  return {
    region: normalizeRegion(region),
    providers: [],
    providerLogos: {},
    availability: createEmptyProviderAvailability(),
    watchUrl: null,
    fetchedAt: null,
    status,
  };
}
