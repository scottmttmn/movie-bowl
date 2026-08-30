// Knowing whether this tab is still running the deployed build.
//
// A deploy replaces the whole hashed bundle. A tab that was already open keeps
// running the old entry chunk, and the lazy chunks it still expects are gone
// from the CDN -- so the next route it loads throws and the app renders nothing
// until someone refreshes by hand. Everything here exists so the app can notice
// that and fix itself: a build id to compare against, a way to read the
// deployed one, and a reload that can only fire once per window so a genuinely
// broken build cannot turn into a refresh loop.

import { isOffline } from "./networkErrors";

// Injected by vite.config.js. Anything that skips `define` (tests, an unbuilt
// runtime) falls back to a constant, which simply reads as "never stale".
export const APP_BUILD_ID =
  typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "development";

export const VERSION_MANIFEST_URL = "/version.json";

// Only a real build publishes the manifest. The dev server replaces code with
// HMR instead, and asking it for a file that does not exist would put a 404 in
// everyone's console for a check that has nothing to report.
export const CAN_CHECK_FOR_UPDATES = import.meta.env.PROD;

// One reload is enough to pick up a new deploy. Anything sooner than this is a
// second failure, not a second deploy, so it gets the visible fallback instead.
const RELOAD_GUARD_KEY = "movie-bowl:build-reload";
const RELOAD_GUARD_MS = 60000;

// What the browsers say when a dynamic import cannot be fetched. Each engine
// words it differently, and a missing chunk on Vercel 404s rather than being
// rewritten to index.html, so the MIME-type phrasings only show up behind a
// proxy that answers with HTML.
const STALE_CHUNK_MESSAGE_FRAGMENTS = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "unable to preload css",
  "is not a valid javascript mime type",
  "expected a javascript module script",
];

function getSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    // The app still works without storage; it just cannot reload unattended.
    return null;
  }
}

// Reads the id the CDN is currently serving. Failures are expected -- the
// device may be offline or the file may not exist on an older deploy -- and an
// empty answer means "cannot tell", never "out of date".
export async function fetchDeployedBuildId(fetchImpl) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== "function") return "";

  try {
    // Both the query param and the header: mobile browsers have been known to
    // serve a cached manifest despite no-store, which would hide every deploy.
    const response = await doFetch(`${VERSION_MANIFEST_URL}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response?.ok) return "";

    const payload = await response.json();
    return typeof payload?.buildId === "string" ? payload.buildId : "";
  } catch {
    return "";
  }
}

export function isNewBuildId(deployedBuildId, currentBuildId = APP_BUILD_ID) {
  if (!deployedBuildId || !currentBuildId) return false;
  return deployedBuildId !== currentBuildId;
}

export function isStaleChunkError(error) {
  if (!error) return false;

  // Offline produces the same failure, and reloading there trades a broken
  // route for the browser's own error page. Let the offline banner have it.
  if (isOffline()) return false;

  const text = `${error?.message ?? ""} ${error?.name ?? ""}`.toLowerCase();
  return STALE_CHUNK_MESSAGE_FRAGMENTS.some((fragment) => text.includes(fragment));
}

// Reloads at most once per guard window. Returns whether a reload was started,
// so callers can fall back to asking the user when it was not.
export function reloadForNewBuild(options = {}) {
  const now = options.now ?? Date.now();
  const storage = "storage" in options ? options.storage : getSessionStorage();
  const reload = options.reload ?? (() => window.location.reload());

  // Without storage there is no way to tell a first attempt from a loop, so
  // stay put and let the visible fallback ask the user instead.
  if (!storage) return false;

  let lastAttempt = 0;
  try {
    lastAttempt = Number(storage.getItem(RELOAD_GUARD_KEY)) || 0;
  } catch {
    return false;
  }

  // A `lastAttempt` in the future means the clock moved, not that we just
  // reloaded, so it must not block recovery forever.
  if (lastAttempt && now >= lastAttempt && now - lastAttempt < RELOAD_GUARD_MS) {
    return false;
  }

  try {
    storage.setItem(RELOAD_GUARD_KEY, String(now));
  } catch {
    return false;
  }

  reload();
  return true;
}

// The failed-import path: reload only when the failure looks like a chunk the
// deploy moved out from under us.
export function recoverFromStaleChunkError(error, options) {
  return isStaleChunkError(error) && reloadForNewBuild(options);
}
