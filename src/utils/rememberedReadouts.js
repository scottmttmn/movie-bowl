// What a page last settled on, kept so the next visit can open on it.
//
// A readout like "Drawing from 2 on Netflix" is the last thing on a page to
// know its answer: it waits for the movies, then the saved filters, then a
// streaming lookup per title. Rendering each step on the way made a refresh
// flash through "Nothing to draw" and an unfiltered count before settling on
// the number it showed a minute ago. Opening on that number instead means a
// refresh moves nothing unless the answer really changed.
//
// It is a placeholder, never an input: nothing draws from it, and the page
// replaces it with the live answer as soon as that has settled.

const STORAGE_KEY = "movie-bowl:remembered-readouts";
// One entry per bowl someone has opened on this device, so it is capped rather
// than left to grow with every bowl they have ever visited.
const MAX_ENTRIES = 30;

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    // Some Android WebView configurations throw on the accessor itself.
    return null;
  }
}

function readAll(storage) {
  try {
    const stored = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  } catch {
    // Unreadable storage means nothing is remembered; the page shows its
    // placeholder instead, which is where it started before this existed.
    return {};
  }
}

/**
 * The value remembered under `key`, with the account it was saved for.
 *
 * Returned whole rather than filtered by account, because the dashboard learns
 * who is signed in only after its first render. It opens on the entry and drops
 * it once the account turns out to be someone else's.
 */
export function readRememberedReadout(key) {
  const storage = getStorage();
  if (!storage || !key) return null;

  const entry = readAll(storage)[key];
  if (!entry || typeof entry !== "object" || !("value" in entry)) return null;
  return { userId: entry.userId ?? null, value: entry.value };
}

export function rememberReadout(key, userId, value) {
  const storage = getStorage();
  if (!storage || !key || !userId) return false;

  const entries = readAll(storage);
  entries[key] = { userId, value, savedAt: Date.now() };

  const kept = Object.entries(entries)
    .sort(([, first], [, second]) => (second?.savedAt || 0) - (first?.savedAt || 0))
    .slice(0, MAX_ENTRIES);

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
    return true;
  } catch {
    // Full or blocked storage costs the next visit its head start, nothing
    // else: it opens on the placeholder and settles as it always did.
    return false;
  }
}

/**
 * The remembered value if it belongs to this account. An unknown account is
 * given the benefit of the doubt for the moment before the page learns it.
 */
export function getRememberedValueFor(entry, userId) {
  if (!entry) return null;
  if (userId && entry.userId && entry.userId !== userId) return null;
  return entry.value;
}
