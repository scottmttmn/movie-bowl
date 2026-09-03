export const RETURN_UNDO_WINDOW_MS = 2 * 60 * 60 * 1000;

function toTimestamp(value) {
  if (typeof value === "number") return value;
  return new Date(value || "").getTime();
}

// Returning a movie means the group did not watch this pick, and that reading
// only holds close to the draw. Past the window the action is refused -- by the
// database, not just here -- and putting the title back for another viewing is
// Add Movie, which leaves the earlier draw and everyone's history intact.
export function canReturnDrawToBowl(drawEvent, now = Date.now()) {
  if (drawEvent?.returned_at || drawEvent?.returnedAt) return false;

  const drawnAt = toTimestamp(drawEvent?.drawn_at || drawEvent?.drawnAt);
  const nowTimestamp = toTimestamp(now);

  return (
    Number.isFinite(drawnAt) &&
    Number.isFinite(nowTimestamp) &&
    nowTimestamp <= drawnAt + RETURN_UNDO_WINDOW_MS
  );
}
