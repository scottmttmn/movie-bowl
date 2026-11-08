import { supabase } from "./supabase";

// Search by description, through api/tmdb/search's describe action.
// Signed-in only: without a session there is nothing to ask, and the search
// simply stays a title search (a public add link, for one).

async function getAccessToken(client) {
  try {
    const { data } = await client.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

export async function requestSearchAction(params, { client = supabase, fetchImpl = fetch } = {}) {
  const token = await getAccessToken(client);
  if (!token) return { status: "signed-out" };
  const response = await fetchImpl(`/api/tmdb/search?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `Request failed with ${response.status}`);
  return body;
}

export function describeSearch(query, { client = supabase, fetchImpl = fetch } = {}) {
  return requestSearchAction({ type: "describe", query }, { client, fetchImpl });
}
