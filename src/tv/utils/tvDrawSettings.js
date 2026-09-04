import { normalizeDefaultDrawSettings } from "../../utils/drawSettings";

const STORAGE_PREFIX = "movie-bowl:tv:draw-settings";

// Only these may diverge on a television. Genres and runtime are missing on
// purpose: neither has a control a D-pad can work, so they keep pointing at the
// phone. Streaming services and the draw method are missing because neither
// describes the room -- one is what the account subscribes to, the other is the
// bowl owner's choice.
export const TV_OVERRIDABLE_SETTINGS = [
  "prioritizeStreaming",
  "useStreamingRank",
  "theaterModeEnabled",
  "includeUnknownRatings",
  "includeUnknownGenres",
  "includeUnknownRuntime",
];

const OVERRIDABLE = new Set(TV_OVERRIDABLE_SETTINGS);

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    // Some Android WebView configurations throw on the accessor itself.
    return null;
  }
}

// Keyed by account because a television is signed in as somebody. Two people
// sharing one set should not inherit each other's overrides, and the key is not
// a secret -- it never leaves the device.
function storageKey(userId) {
  return userId ? `${STORAGE_PREFIX}:${userId}` : null;
}

/**
 * Only the settings someone actually changed on this television, never a
 * snapshot of all of them. A snapshot would freeze everything at the first
 * change, so a later phone edit would appear to do nothing with no way to see
 * why. A patch lets a setting the television has no opinion about keep
 * following the account.
 */
export function readTvSettingsOverrides(userId) {
  const storage = getStorage();
  const key = storageKey(userId);
  if (!storage || !key) return {};

  try {
    const stored = JSON.parse(storage.getItem(key) || "null");
    if (!stored || typeof stored !== "object") return {};

    return Object.fromEntries(
      Object.entries(stored).filter(
        ([name, value]) => OVERRIDABLE.has(name) && typeof value === "boolean"
      )
    );
  } catch {
    // Unreadable storage means this television simply has no opinions yet.
    return {};
  }
}

export function writeTvSettingsOverrides(userId, overrides) {
  const storage = getStorage();
  const key = storageKey(userId);
  if (!storage || !key) return false;

  const clean = Object.fromEntries(
    Object.entries(overrides || {}).filter(
      ([name, value]) => OVERRIDABLE.has(name) && typeof value === "boolean"
    )
  );

  try {
    if (Object.keys(clean).length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(clean));
    return true;
  } catch {
    // The preference is lost, not the screen. The draw still runs on the
    // account settings, which is what it did before this feature existed.
    return false;
  }
}

export function clearTvSettingsOverrides(userId) {
  return writeTvSettingsOverrides(userId, {});
}

/**
 * The account settings with this television's overrides laid over them, run
 * through the same normalizer the phone uses so a stale or hand-edited value
 * cannot reach the draw.
 */
export function mergeTvDrawSettings(accountSettings, overrides) {
  return normalizeDefaultDrawSettings({ ...(accountSettings || {}), ...(overrides || {}) });
}
