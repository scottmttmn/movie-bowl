import { supabase } from "./supabase";

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const cache = new Map();
const inflight = new Map();
let generation = 0;

export function clearProviderLinksCache() {
  generation += 1;
  cache.clear();
  inflight.clear();
}

export async function fetchProviderLinks(tmdbId, bowlId) {
  const id = Number(tmdbId);
  if (!Number.isSafeInteger(id) || id <= 0 || !bowlId) return { links: [] };
  try {
    const { data, error } = await supabase.auth.getSession();
    const session = data?.session;
    if (error || !session?.access_token || !session.user?.id) return { links: [] };
    // A cache hit must not cross accounts or bypass the route's bowl boundary.
    const key = `${session.user.id}:${bowlId}:${id}`;
    const cached = cache.get(key);
    if (cached?.expiresAt > Date.now()) return cached.value;
    if (inflight.has(key)) return inflight.get(key);
    const requestGeneration = generation;
    const request = (async () => {
      try {
        const response = await fetch("/api/provider-links/lookup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ id, bowlId }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return { links: [] };
        const result = await response.json();
        const fetchedAt = Date.parse(result.fetchedAt);
        const expiresAt = Math.min(
          Date.now() + CACHE_TTL_MS,
          Number.isFinite(fetchedAt) ? fetchedAt + MAX_AGE_MS : Date.now() + CACHE_TTL_MS
        );
        const value = {
          links: expiresAt > Date.now() && Array.isArray(result.links) ? result.links : [],
        };
        if (generation === requestGeneration) cache.set(key, { value, expiresAt });
        return value;
      } catch {
        return { links: [] };
      } finally {
        if (generation === requestGeneration) inflight.delete(key);
      }
    })();
    inflight.set(key, request);
    return request;
  } catch {
    return { links: [] };
  }
}
