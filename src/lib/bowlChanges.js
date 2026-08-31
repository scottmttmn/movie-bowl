// Mutations publish invalidations without making the bowl engine depend on
// route providers. Subscribers are scoped to the current account or bowl.
const listeners = new Set();
export function notifyBowlChange(change = {}) {
  for (const listener of listeners) listener(change);
}
export function subscribeBowlChanges(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
