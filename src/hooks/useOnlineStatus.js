import { useSyncExternalStore } from "react";
import { isOffline } from "../utils/networkErrors";

// Tracks connectivity so surfaces can explain themselves instead of failing
// blankly. The browser's `online` event only proves an interface came back, not
// that anything is reachable, so treat this as a hint for copy and for knowing
// when a retry is worth attempting -- never as proof a request will succeed.
//
// This is an external store rather than state plus an effect: React re-reads
// the snapshot right after subscribing, which closes the gap where the
// connection drops between the first render and the listeners attaching.

function subscribe(onStoreChange) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);

  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getSnapshot() {
  return !isOffline();
}

// Nothing is reachable during a server render anyway, and assuming online keeps
// the banner out of the first paint.
function getServerSnapshot() {
  return true;
}

export default function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
