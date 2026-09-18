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

export const SOLO_UNDO_WINDOW_MS = 2 * 60 * 60 * 1000;

// Two hours, matching the group draw's undo window. With automatic removal off
// a solo draw changed no bowl, so undo is the same delete as always and all the
// window buys is the word: inside it this reads as undoing tonight's draw,
// after it as editing your history. With the setting on there is something to
// put back, and then the same window is the server's to enforce -- this only
// decides which action to offer.
export function isWithinSoloUndoWindow(entry, now = Date.now()) {
  if (entry?.source_kind !== "solo_draw") return false;

  const committedAt = toTimestamp(entry?.created_at);
  const nowTimestamp = toTimestamp(now);

  return (
    Number.isFinite(committedAt) &&
    Number.isFinite(nowTimestamp) &&
    nowTimestamp - committedAt <= SOLO_UNDO_WINDOW_MS
  );
}
