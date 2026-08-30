import {
  AVAILABLE_STREAMING_SERVICES,
  normalizeServiceName,
} from "../../src/utils/streamingServices.js";
import { safeProviderUrl } from "../../src/utils/webLaunch.js";

const WATCHMODE_SOURCE_ALIASES = {
  "amazon prime": "Prime Video",
  amazon: "Prime Video",
  appletv: "Apple TV+",
  "apple tv": "Apple TV+",
  "tubi tv": "Tubi",
};
const services = new Map(AVAILABLE_STREAMING_SERVICES.map((name) => [name.toLowerCase(), name]));

export function normalizeProviderLinks(sources) {
  if (!Array.isArray(sources)) throw new Error("Invalid Watchmode response");
  const seen = new Set();
  return sources.flatMap((source) => {
    if (source?.region !== "US" || typeof source.name !== "string") return [];
    const alias = WATCHMODE_SOURCE_ALIASES[source.name.trim().toLowerCase()];
    const service = services.get(normalizeServiceName(alias || source.name).toLowerCase());
    if (!service || !["sub", "free", "rent", "buy", "tve"].includes(source.type)) return [];
    const link = {
      service,
      type: source.type,
      webUrl: safeProviderUrl(source.web_url),
      iosUrl: safeProviderUrl(source.ios_url, { native: true }),
      androidUrl: safeProviderUrl(source.android_url, { native: true }),
    };
    if (!link.webUrl && !link.iosUrl && !link.androidUrl) return [];
    const key = JSON.stringify(link);
    if (seen.has(key)) return [];
    seen.add(key);
    return [link];
  });
}

export async function fetchProviderLinks(tmdbId) {
  // Headers keep the credential out of URLs and upstream request logs.
  const response = await fetch(
    `https://api.watchmode.com/v1/title/movie-${tmdbId}/sources/?regions=US`,
    {
      headers: { "X-API-Key": process.env.WATCHMODE_API_KEY },
      signal: AbortSignal.timeout(5000),
    }
  );
  if (!response.ok) throw new Error(`Watchmode request failed (${response.status})`);
  return normalizeProviderLinks(await response.json());
}

export async function pruneProviderLinks(supabaseAdmin) {
  const { error } = await supabaseAdmin.rpc("prune_title_provider_links");
  if (error) throw new Error("Failed to expire provider links");
}
