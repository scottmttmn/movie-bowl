// A read that loses its document did not fail. The browser aborts whatever is
// in flight when a page goes away and reports it as `TypeError: Failed to
// fetch` -- the same shape a real network failure has -- so the difference
// cannot come from the error. It has to come from the document's own
// lifecycle: nobody is left to be told, and the page that would have shown the
// message is already gone.
//
// `pagehide` is the signal rather than `beforeunload`, which fires for a
// navigation that is still cancellable -- `useAutosave` calls preventDefault on
// it, so a page that stays would otherwise be left permanently unable to report
// a genuine failure. `visibilitychange` is not it either: switching tabs hides
// a document that is very much still there.
let unloading = false;

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    unloading = true;
  });
  // A bfcache restore brings the same document back, so it can report again.
  window.addEventListener("pageshow", () => {
    unloading = false;
  });
}

export function isPageUnloading() {
  return unloading;
}

// The flag latches for the life of a document, which is what a browser wants
// and what a suite sharing one jsdom window cannot have.
export function resetPageLifecycleForTests() {
  unloading = false;
}
