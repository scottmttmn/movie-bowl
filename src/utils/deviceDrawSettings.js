import { normalizeDefaultDrawSettings } from "./drawSettings";

// Still says `tv` because televisions are already storing under it. The module
// generalised from one surface to every device; the key cannot follow without
// every television silently forgetting what someone set in its room, and a
// migration to rename it would be more code than the name is worth.
const STORAGE_PREFIX = "movie-bowl:tv:draw-settings";

// Only these may diverge on a device, and the list is short on purpose: a
// surface shows what the room can decide, not everything the account can.
// Genres and runtime are missing because neither has a control a D-pad can
// work; streaming services and the draw method because neither describes the
// room -- one is what the account subscribes to, the other is the bowl owner's
// choice. The includeUnknown* escapes left when their rows did: they are worth
// having where you can see the filter they escape, which is the phone.
//
// A pointer and a keyboard dissolve the D-pad half of that argument but not the
// rest, so the list gets a fresh answer when a surface actually asks for one
// rather than a rename now.
//
// Dropping a name here also retires whatever a device already stored under it,
// because readDeviceSettingsOverrides filters against this list. That matters:
// an override with no control left would keep narrowing the draw with nothing
// on screen to explain it or turn it off.
export const DEVICE_OVERRIDABLE_SETTINGS = [
  "prioritizeStreaming",
  "useStreamingRank",
  "theaterModeEnabled",
];

const OVERRIDABLE = new Set(DEVICE_OVERRIDABLE_SETTINGS);

// Frozen and module-level so a caller passing nothing hands the same object
// every render, which keeps the merge memoizable.
export const NO_SURFACE_DEFAULTS = Object.freeze({});

// The phone and laptop decline to inherit theater mode, because enabling it
// meant enabling it for a television. Every other setting still follows the
// account here; the ticket beside the draw button is how this device says yes.
export const WEB_SURFACE_DEFAULTS = Object.freeze({ theaterModeEnabled: false });

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    // Some Android WebView configurations throw on the accessor itself.
    return null;
  }
}

// Keyed by account because a device is signed in as somebody. Two people
// sharing one set should not inherit each other's overrides, and the key is not
// a secret -- it never leaves the device.
function storageKey(userId) {
  return userId ? `${STORAGE_PREFIX}:${userId}` : null;
}

/**
 * Only the settings someone actually changed on this device, never a snapshot
 * of all of them. A snapshot would freeze everything at the first change, so a
 * later phone edit would appear to do nothing with no way to see why. A patch
 * lets a setting the device has no opinion about keep following the account.
 */
export function readDeviceSettingsOverrides(userId) {
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
    // Unreadable storage means this device simply has no opinions yet.
    return {};
  }
}

export function writeDeviceSettingsOverrides(userId, overrides) {
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

export function clearDeviceSettingsOverrides(userId) {
  return writeDeviceSettingsOverrides(userId, {});
}

/**
 * The account settings as one device sees them, run through the same normalizer
 * the phone uses so a stale or hand-edited value cannot reach the draw.
 *
 * Three layers, and the order is the whole design. `surfaceDefaults` sits
 * *between* the account and the device rather than beneath everything: it is
 * how a surface declines to inherit an account setting that does not mean the
 * same thing there. The web reads `theaterModeEnabled` that way -- someone who
 * enabled theater mode enabled it for a television, so a laptop starts off and
 * the ticket is how you arm it -- while the television passes nothing and falls
 * through to the account as it always has. A device override still wins over
 * both, because it is the one layer someone set on the device in front of them.
 */
export function mergeDeviceDrawSettings(
  accountSettings,
  overrides,
  surfaceDefaults = NO_SURFACE_DEFAULTS
) {
  return normalizeDefaultDrawSettings({
    ...(accountSettings || {}),
    ...(surfaceDefaults || {}),
    ...(overrides || {}),
  });
}
