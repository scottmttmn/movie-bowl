import { supabase } from "./supabase";

// One session per add sheet: Google groups the keystrokes of one search under
// it. Any string of the right shape will do; it identifies nobody.
export function createPlacesSessionToken() {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

// Resolves, never rejects: { available, results }. Unavailable means the sheet
// should offer adding by name, whether the key is missing, Google failed or
// the network did; an aborted search resolves as unavailable too and its
// caller has already moved on.
export async function searchPlaces({ query, sessionToken, signal } = {}) {
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (!accessToken) return { available: false, results: [] };

    const response = await fetch("/api/places/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, sessionToken }),
      signal,
    });
    if (!response.ok) return { available: false, results: [] };
    const body = await response.json();
    return {
      available: body?.available === true,
      results: Array.isArray(body?.results) ? body.results : [],
    };
  } catch (error) {
    if (error?.name !== "AbortError") console.error("[placesSearch] Search failed", error);
    return { available: false, results: [] };
  }
}
