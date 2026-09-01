export const RETURN_HISTORY_CLEANUP_WINDOW_MS = 2 * 60 * 60 * 1000;

function toTimestamp(value) {
  if (typeof value === "number") return value;
  return new Date(value || "").getTime();
}

export function isWithinReturnHistoryCleanupWindow(movie, returnedAt = Date.now()) {
  const drawnAt = toTimestamp(movie?.drawn_at || movie?.drawnAt);
  const returnedAtTimestamp = toTimestamp(returnedAt);

  return (
    Number.isFinite(drawnAt) &&
    Number.isFinite(returnedAtTimestamp) &&
    returnedAtTimestamp <= drawnAt + RETURN_HISTORY_CLEANUP_WINDOW_MS
  );
}

export function belongsInBowlWatchHistory(drawEvent) {
  const returnedAt = drawEvent?.returned_at || drawEvent?.returnedAt;
  if (!returnedAt) return true;

  // A bounded return is an undo, so it should disappear from history. An older
  // return is part of the bowl's durable history and remains visible.
  return !isWithinReturnHistoryCleanupWindow(drawEvent, returnedAt);
}
