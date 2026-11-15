import { WEEKDAYS, clockTime, onPlaceClock } from "./restaurants";

// The restaurant bowl's Open filter: is this place open at the time the group
// means to eat? See output/designs/restaurant-bowls.md. Everything here is
// pure; the hours come from usePlaceHours and are never stored.

export const OPEN_MODES = Object.freeze({ any: "any", now: "now", tonight: "tonight", pick: "pick" });
export const ANY_TIME = Object.freeze({ mode: OPEN_MODES.any });

const MINUTES_PER_DAY = 1_440;
const MINUTES_PER_WEEK = 10_080;
// Dinner, which is what "tonight" means until the evening is already here.
const TONIGHT_MINUTES = 19 * 60;
// Google answers for the seven days ahead, holidays included, so that is as
// far as a day can be picked.
export const PICK_DAY_COUNT = 7;

function localDay(now, offset = 0) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function dayKey(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The days the picker offers, from today: Today, Tomorrow, then weekdays.
export function getPickDays(now = Date.now()) {
  return Array.from({ length: PICK_DAY_COUNT }, (_, offset) => {
    const date = localDay(now, offset);
    return {
      value: dayKey(date),
      label: offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : WEEKDAYS[date.getDay()],
    };
  });
}

// Every half hour a kitchen might be open, 6 AM to 11:30 PM.
export const PICK_TIMES = Object.freeze(
  Array.from({ length: 36 }, (_, index) => {
    const minutes = 6 * 60 + index * 30;
    return { value: minutes, label: clockTime(new Date(Date.UTC(2026, 0, 1, 0, minutes))) };
  })
);

// Picking starts on tomorrow's dinner: Now and Tonight already cover today.
export function getDefaultPick(now = Date.now()) {
  return { mode: OPEN_MODES.pick, day: dayKey(localDay(now, 1)), minutes: TONIGHT_MINUTES };
}

// A picked day that has passed, or anything unreadable, is no filter at all.
export function normalizeOpenChoice(choice, now = Date.now()) {
  if (choice?.mode === OPEN_MODES.now || choice?.mode === OPEN_MODES.tonight) return { mode: choice.mode };
  if (choice?.mode !== OPEN_MODES.pick) return ANY_TIME;
  const day = getPickDays(now).find((option) => option.value === choice.day);
  const minutes = Number(choice.minutes);
  if (!day || !Number.isInteger(minutes) || minutes < 0 || minutes >= MINUTES_PER_DAY) return ANY_TIME;
  return { mode: OPEN_MODES.pick, day: day.value, minutes };
}

// The moment a choice asks about. Now is an instant, read on each
// restaurant's own clock. Tonight and a picked time are wall-clock times:
// "Saturday at 7" means 7 on the restaurant's door wherever the phone is.
export function resolveOpenMoment(choice, now = Date.now()) {
  const normalized = normalizeOpenChoice(choice, now);
  if (normalized.mode === OPEN_MODES.any) return null;
  if (normalized.mode === OPEN_MODES.now) return { instant: now };
  if (normalized.mode === OPEN_MODES.tonight) {
    const here = new Date(now);
    // Once dinner time has passed, tonight is now.
    if (here.getHours() * 60 + here.getMinutes() >= TONIGHT_MINUTES) return { instant: now };
    return { wall: { weekday: here.getDay(), minutes: TONIGHT_MINUTES } };
  }
  const [year, month, day] = normalized.day.split("-").map(Number);
  return { wall: { weekday: new Date(year, month - 1, day).getDay(), minutes: normalized.minutes } };
}

// "now", "tonight", "Sat at 7 PM": how the readouts name the choice.
export function describeOpenChoice(choice, now = Date.now()) {
  const normalized = normalizeOpenChoice(choice, now);
  if (normalized.mode === OPEN_MODES.any) return "";
  if (normalized.mode === OPEN_MODES.now) return "now";
  if (normalized.mode === OPEN_MODES.tonight) return "tonight";
  const day = getPickDays(now).find((option) => option.value === normalized.day);
  const time = clockTime(new Date(Date.UTC(2026, 0, 1, 0, normalized.minutes)));
  return `${day.label === "Today" || day.label === "Tomorrow" ? day.label.toLowerCase() : day.label} at ${time}`;
}

function weekMinute(point) {
  const day = Number(point?.day);
  const hour = Number(point?.hour);
  const minute = Number(point?.minute ?? 0);
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return day * MINUTES_PER_DAY + hour * 60 + minute;
}

// true, false, or null when the hours cannot say. Periods are a week of
// opening and closing points on the restaurant's clock; one that closes after
// midnight, or on Sunday morning after a Saturday opening, wraps the week.
export function isOpenAt(hours, moment) {
  if (!hours || !moment) return null;
  if (hours.closedForGood) return false;
  if (!Array.isArray(hours.periods)) return null;

  let at;
  if (moment.wall) {
    at = moment.wall.weekday * MINUTES_PER_DAY + moment.wall.minutes;
  } else {
    const here = onPlaceClock(moment.instant, hours);
    at = here.getUTCDay() * MINUTES_PER_DAY + here.getUTCHours() * 60 + here.getUTCMinutes();
  }

  return hours.periods.some((period) => {
    const opens = weekMinute(period?.open);
    if (opens === null) return false;
    // Google gives a place that never closes one opening and no closing.
    if (!period.close) return true;
    let closes = weekMinute(period.close);
    if (closes === null) return false;
    if (closes <= opens) closes += MINUTES_PER_WEEK;
    return (opens <= at && at < closes) || (opens <= at + MINUTES_PER_WEEK && at + MINUTES_PER_WEEK < closes);
  });
}

// Sorts a bowl's slips by what their hours say at the moment asked about.
// "unknown" holds the slips the filter cannot remove: added by name, or
// Google had no hours for them.
export function sortSlipsByOpen(slips, hoursByPlaceId, moment) {
  const result = { open: [], closed: [], unknown: [] };
  (Array.isArray(slips) ? slips : []).forEach((slip) => {
    const answer = slip?.place_id ? isOpenAt(hoursByPlaceId?.[slip.place_id], moment) : null;
    result[answer === true ? "open" : answer === false ? "closed" : "unknown"].push(slip);
  });
  return result;
}

export function getClosedPlaceIds(slips, hoursByPlaceId, moment) {
  if (!moment) return [];
  return [...new Set(sortSlipsByOpen(slips, hoursByPlaceId, moment).closed.map((slip) => slip.place_id))].sort();
}
