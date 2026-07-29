// Remembers the bowl a user last opened so returning visitors land back in it
// instead of re-picking from the list. Storage is per user and per device, and
// every read is treated as a hint: the bowl may since have been deleted or the
// user removed from it, so callers must handle a stale id gracefully.

const STORAGE_KEY_PREFIX = "movie-bowl:last-bowl:";

function getStorageKey(userId) {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

export function getLastOpenedBowlId(userId) {
  if (!userId) return "";
  try {
    return window.localStorage.getItem(getStorageKey(userId)) || "";
  } catch {
    // The app still works when browser storage is unavailable.
    return "";
  }
}

export function rememberLastOpenedBowl(userId, bowlId) {
  if (!userId || !bowlId) return;
  try {
    window.localStorage.setItem(getStorageKey(userId), bowlId);
  } catch {
    // Ignore: remembering the bowl is an optimization, not a requirement.
  }
}

export function forgetLastOpenedBowl(userId) {
  if (!userId) return;
  try {
    window.localStorage.removeItem(getStorageKey(userId));
  } catch {
    // Ignore: see above.
  }
}
