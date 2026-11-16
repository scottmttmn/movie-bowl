export const RETURN_UNDO_WINDOW_MS = 2 * 60 * 60 * 1000;

function toTimestamp(value) {
  if (typeof value === "number") return value;
  return new Date(value || "").getTime();
}

// Returning a movie means the group did not watch this pick, and that reading
// only holds close to the draw. Past the window the action is refused -- by the
// database, not just here -- and putting the title back for another viewing is
// Add Movie, which leaves the earlier draw and everyone's history intact.
//
// A restaurant drawn ahead for a day is the exception: nobody has eaten yet,
// so its draw carries a later deadline, the end of that day, in return_until.
export function getReturnDeadline(drawEvent) {
  const drawnAt = toTimestamp(drawEvent?.drawn_at || drawEvent?.drawnAt);
  if (!Number.isFinite(drawnAt)) return null;
  const until = toTimestamp(drawEvent?.return_until || drawEvent?.returnUntil);
  const windowEnd = drawnAt + RETURN_UNDO_WINDOW_MS;
  return Number.isFinite(until) ? Math.max(windowEnd, until) : windowEnd;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// "today", "tomorrow" or "Saturday": the day a draw was made for, when its
// deadline is that day's end rather than the two hours'. Null otherwise.
export function describePlannedReturnDay(drawEvent, now = Date.now()) {
  const drawnAt = toTimestamp(drawEvent?.drawn_at || drawEvent?.drawnAt);
  const deadline = getReturnDeadline(drawEvent);
  if (deadline === null || deadline <= drawnAt + RETURN_UNDO_WINDOW_MS) return null;
  // The deadline is the midnight that ends the day, so the day is just before it.
  const day = new Date(deadline - 1);
  const startOf = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const daysAway = Math.round((startOf(day) - startOf(new Date(toTimestamp(now)))) / 86_400_000);
  if (daysAway === 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return WEEKDAY_NAMES[day.getDay()];
}

export function canReturnDrawToBowl(drawEvent, now = Date.now()) {
  if (drawEvent?.returned_at || drawEvent?.returnedAt) return false;

  const deadline = getReturnDeadline(drawEvent);
  const nowTimestamp = toTimestamp(now);

  return deadline !== null && Number.isFinite(nowTimestamp) && nowTimestamp <= deadline;
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
