// Sends a Supabase read now so it can run beside others, and hands back a
// promise that is safe to await later or never.
//
// A query builder is lazy and re-sends its request every time it is awaited, so
// it is settled into a real promise exactly once. The rejection is marked
// handled up front: a screen that returns early on one failed read leaves the
// others unawaited, and that must not surface as an unhandled rejection.
export function startRead(query) {
  const request = Promise.resolve(query);
  request.catch(() => {});
  return request;
}
