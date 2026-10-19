import { supabase } from "./supabase";

const cache = new Map();
const inflight = new Map();
const LOCAL_TTL_MS = 5 * 60 * 1000;
let generation = 0;

export function clearTitleDeparturesCache() {
  generation += 1;
  cache.clear();
  inflight.clear();
}

export async function fetchTitleDepartures(tmdbId, servicesKey, { bowlId = null } = {}) {
  const id = Number(tmdbId);
  if (!Number.isSafeInteger(id) || id <= 0 || !servicesKey) return { departures: [] };
  try {
    const { data, error } = await supabase.auth.getSession();
    const session = data?.session;
    if (error || !session?.user?.id || !session.access_token) return { departures: [] };
    const readKey = `${session.user.id}:${id}:${servicesKey}:read`;
    const key = bowlId ? `${readKey}:${bowlId}` : readKey;
    if (cache.get(readKey)?.expiresAt > Date.now()) return cache.get(readKey).value;
    if (inflight.has(key)) return inflight.get(key);
    const requestGeneration = generation;
    const request = (async () => {
      try {
        const response = await fetch("/api/title-departures/lookup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(bowlId ? { id, bowlId } : { id }),
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) return { departures: [] };
        const result = await response.json();
        const validUntil = Date.parse(result.validUntil);
        const value = {
          departures:
            Array.isArray(result.departures) && validUntil > Date.now() ? result.departures : [],
          validUntil: result.validUntil,
        };
        if (generation === requestGeneration && validUntil > Date.now()) {
          if (cache.size >= 300) cache.delete(cache.keys().next().value);
          cache.set(readKey, { value, expiresAt: Math.min(Date.now() + LOCAL_TTL_MS, validUntil) });
        }
        return value;
      } catch {
        return { departures: [] };
      } finally {
        if (generation === requestGeneration) inflight.delete(key);
      }
    })();
    inflight.set(key, request);
    return request;
  } catch {
    return { departures: [] };
  }
}
