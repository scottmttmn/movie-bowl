// The cuisines left out of a restaurant bowl's draw, remembered on this device
// for the account and the bowl. The movie filters live on the account because
// they describe a taste; which cuisines suit tonight belongs to one bowl, and
// is cheap enough to set again on another device.
const KEY_PREFIX = "movieBowl.restaurantCuisines.v1";

function storageKey(userId, bowlId) {
  return userId && bowlId ? `${KEY_PREFIX}:${userId}:${bowlId}` : null;
}

export function readExcludedCuisines(userId, bowlId) {
  const key = storageKey(userId, bowlId);
  if (!key) return [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(saved) ? saved.filter((value) => typeof value === "string") : [];
  } catch {
    // Storage unavailable or unreadable: every cuisine is in the draw.
    return [];
  }
}

export function writeExcludedCuisines(userId, bowlId, excluded) {
  const key = storageKey(userId, bowlId);
  if (!key) return;
  try {
    if (excluded.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(excluded));
  } catch {
    // Not remembered; the filter still applies to this visit.
  }
}
