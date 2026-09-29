// The API returns at most 1,000 rows a request and says nothing when it stops
// there, so a history read that asks once looks complete and is not. History
// grows without limit, so it is read in pages until a page comes back short.
//
// The page is half the API's cap on purpose: a short page is the only sign the
// history has ended, and a page larger than the cap would always look short.
export const HISTORY_PAGE_SIZE = 500;

/**
 * Reads every row of a query, a page at a time. `buildQuery` returns a fresh
 * Supabase query each call, ordered so that pages do not overlap (end the
 * order on `id`). Resolves to `{ data, error }` like a single read: any failed
 * page fails the whole read, so a caller never shows part of a history as all
 * of it. Rows with an `id` already seen are dropped, in case one moved between
 * pages while they were read.
 */
export async function readAllRows(buildQuery, { pageSize = HISTORY_PAGE_SIZE } = {}) {
  const rows = [];
  const seenIds = new Set();

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };

    const page = data || [];
    for (const row of page) {
      if (row?.id != null) {
        if (seenIds.has(row.id)) continue;
        seenIds.add(row.id);
      }
      rows.push(row);
    }

    if (page.length < pageSize) return { data: rows, error: null };
  }
}
