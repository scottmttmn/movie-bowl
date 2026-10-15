// Whether a bowl page section is open, remembered on this device only. My
// Movies starts closed because the bowl is usually drawn with people around,
// and the screen should not hand them your slips.
const KEY = "movieBowl.sections.v1";
const DEFAULTS = { myMovies: false, watched: false };

function readAll() {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "{}") || {};
  } catch {
    // Storage unavailable: every section opens at its default.
    return {};
  }
}

export function readSectionOpen(section) {
  const saved = readAll()[section];
  return typeof saved === "boolean" ? saved : DEFAULTS[section] ?? false;
}

export function writeSectionOpen(section, open) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [section]: open }));
  } catch {
    // Not remembered; the section still toggles for this visit.
  }
}
