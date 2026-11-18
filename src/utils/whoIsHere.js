import { getContributorBucketKey } from "./drawBuckets";

// Who is in the room for tonight's draw, remembered on this device for the
// account and bowl. Only absences are stored, so someone who joins the bowl
// later is here by default. An absence lasts the evening: after AWAY_TTL_MS
// everyone is back, so last Friday's empty chair never quietly shrinks next
// week's draw.
const KEY_PREFIX = "movieBowl.whoIsHere.v1";
export const AWAY_TTL_MS = 12 * 60 * 60 * 1000;

function storageKey(userId, bowlId) {
  return userId && bowlId ? `${KEY_PREFIX}:${userId}:${bowlId}` : null;
}

function read(userId, bowlId) {
  const key = storageKey(userId, bowlId);
  if (!key) return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    // Storage unavailable: everyone is here and the draw asks each time.
    return {};
  }
}

function write(userId, bowlId, patch) {
  const key = storageKey(userId, bowlId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...read(userId, bowlId), ...patch }));
  } catch {
    // Not remembered; the choice still holds for this visit.
  }
}

// What this device saved for the bowl, unexpired or not; `saved` is false when
// nothing could be read, so a caller holding its own copy can keep it.
export function readRoomRecord(userId, bowlId) {
  const saved = read(userId, bowlId);
  const away = Array.isArray(saved.away) ? saved.away.filter((key) => typeof key === "string") : [];
  return {
    saved: Object.keys(saved).length > 0,
    away,
    awayAt: Number.isFinite(saved.awayAt) ? saved.awayAt : 0,
    skipAsk: saved.skipAsk === true,
  };
}

// The absences still in force: none once their evening is over.
export function liveAwayKeys(record, now = Date.now()) {
  if (!record?.away?.length || !Number.isFinite(record.awayAt) || now - record.awayAt > AWAY_TTL_MS) return [];
  return record.away;
}

export function readAwayKeys(userId, bowlId, now = Date.now()) {
  return liveAwayKeys(readRoomRecord(userId, bowlId), now);
}

export function writeAwayKeys(userId, bowlId, away, now = Date.now()) {
  write(userId, bowlId, { away, awayAt: now });
}

export function readSkipAsk(userId, bowlId) {
  return read(userId, bowlId).skipAsk === true;
}

export function writeSkipAsk(userId, bowlId, skipAsk) {
  write(userId, bowlId, { skipAsk: Boolean(skipAsk) });
}

// The slips of the people in the room. Starter pack titles belong to no one,
// so they stay in for whoever is here; link guests and former members cannot
// be marked away, so their slips stay too.
export function filterPresentMovies(movies, awayKeys) {
  const list = Array.isArray(movies) ? movies : [];
  if (!awayKeys?.length) return list;
  const away = new Set(awayKeys);
  return list.filter((movie) => !away.has(getContributorBucketKey(movie)));
}

// "Just me": every other member is away and the drawer is not.
export function isOnlyMeHere(memberKeys, awayKeys, myKey) {
  if (!myKey || !memberKeys?.length) return false;
  const away = new Set(awayKeys || []);
  return !away.has(myKey) && memberKeys.length > 1
    && memberKeys.every((key) => key === myKey || away.has(key));
}
