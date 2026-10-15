// Whether a bowl page section is open, remembered on this device for the
// account signed in on it. My Movies starts closed because the bowl is usually
// drawn with people around, and the screen should not hand them your slips --
// so neither should another account's choice on a shared browser.
const KEY_PREFIX = "movieBowl.sections.v1";
const DEFAULTS = { myMovies: false, watched: false };

function storageKey(userId) {
  return userId ? `${KEY_PREFIX}:${userId}` : null;
}

function readAll(userId) {
  const key = storageKey(userId);
  if (!key) return {};
  try {
    return JSON.parse(window.localStorage.getItem(key) || "{}") || {};
  } catch {
    // Storage unavailable: every section opens at its default.
    return {};
  }
}

export function readSectionOpen(section, userId) {
  const saved = readAll(userId)[section];
  return typeof saved === "boolean" ? saved : DEFAULTS[section] ?? false;
}

export function writeSectionOpen(section, open, userId) {
  const key = storageKey(userId);
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...readAll(userId), [section]: open }));
  } catch {
    // Not remembered; the section still toggles for this visit.
  }
}
