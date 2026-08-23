// Distinguishes "the network is gone" from "the request was rejected". The two
// need very different copy: a failed fetch while offline is not the movie
// service being down, and telling the user to try again is useless advice when
// the real fix is reconnecting.
//
// Detection is deliberately generous. Browsers, Supabase, and the serverless
// proxy all report a dropped connection differently, and a false positive here
// only costs a slightly wrong message, while a false negative sends the user
// chasing a service outage that is not happening.

export const OFFLINE_MESSAGE =
  "You're offline. Reconnect and this will pick up where it left off.";

// Supabase surfaces its own wrappers around a failed fetch; the browser throws
// a bare TypeError. Match on the shapes rather than the exact class, since the
// client is free to rename these between releases.
const OFFLINE_ERROR_NAMES = new Set([
  "AuthRetryableFetchError",
  "FetchError",
  // Our own wrapper from lib/tmdbApi, so a caller re-classifying the rethrown
  // error still reaches the offline copy rather than the service-outage copy.
  "OfflineError",
  "TypeError",
]);

const OFFLINE_MESSAGE_FRAGMENTS = [
  "failed to fetch",
  "networkerror",
  "network error",
  "network request failed",
  "load failed",
  "err_internet_disconnected",
  "err_network_changed",
  "err_name_not_resolved",
  "connection refused",
  "econnrefused",
  "enotfound",
  "the internet connection appears to be offline",
];

export function isOffline() {
  try {
    // Only trust an explicit false. Anything else (no navigator, a runtime that
    // does not implement it) means we cannot tell, so assume we are online and
    // let the request itself decide.
    return window.navigator.onLine === false;
  } catch {
    return false;
  }
}

export function isOfflineError(error) {
  if (!error) return false;

  // A confirmed-offline browser makes the error's own shape irrelevant.
  if (isOffline()) return true;

  const name = String(error?.name || "");
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const text = `${message} ${details}`;

  if (OFFLINE_MESSAGE_FRAGMENTS.some((fragment) => text.includes(fragment))) {
    return true;
  }

  // A TypeError with no useful message is what a fetch rejection looks like
  // once the browser has stripped the details for cross-origin reasons.
  return OFFLINE_ERROR_NAMES.has(name) && !error?.code && !error?.status;
}

// Wraps a failure in the right user-facing sentence: the offline explanation
// when the connection is the cause, otherwise the caller's own copy.
export function describeNetworkError(error, fallbackMessage) {
  return isOfflineError(error) ? OFFLINE_MESSAGE : fallbackMessage;
}
