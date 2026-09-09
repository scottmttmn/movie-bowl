/**
 * Whether a screen's code is on its way.
 *
 * Every screen is a dynamic import, so the first visit to a route waits for a
 * chunk before anything can render. React Router runs navigation inside a
 * transition, which deliberately keeps the previous screen on the page rather
 * than flashing a fallback -- correct, except that it also means a tap produces
 * no visible response at all until the chunk lands. Measured on a production
 * build over a throttled connection that gap was about 370ms of a screen that
 * looked like nothing had happened.
 *
 * This is not React Router's own pending state: `useNavigation` needs a data
 * router, and this app mounts the declarative one. It is narrower anyway --
 * exactly the window where a chunk is in flight, which is the part that has no
 * other feedback. A second visit to the same route resolves from the module
 * registry without re-entering `track`, so the indicator stays away when there
 * is nothing to wait for.
 */
let pending = 0;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeToRouteLoading(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isRouteLoading() {
  return pending > 0;
}

// Never resolves for a chunk that is gone: recoverFromStaleChunkError reloads
// the document, and a settled count here would hide the indicator while that
// reload is still in flight.
export function trackRouteLoad(promise) {
  pending += 1;
  emit();
  return promise.finally(() => {
    pending = Math.max(0, pending - 1);
    emit();
  });
}

// Test seam: a module-level counter outlives a test file's renders.
export function resetRouteLoading() {
  pending = 0;
  emit();
}
