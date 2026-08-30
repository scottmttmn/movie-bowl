import { useCallback, useEffect, useRef, useState } from "react";
import {
  APP_BUILD_ID,
  CAN_CHECK_FOR_UPDATES,
  fetchDeployedBuildId,
  isNewBuildId,
  reloadForNewBuild,
} from "../utils/appVersion";

// Watches for a deploy landing underneath a running tab, and takes the reload
// itself whenever doing so cannot interrupt anything:
//
// - on load, because a stale cached document is exactly the case that ends in a
//   blank screen, and nobody has typed anything yet;
// - on coming back to an app that has been in the background a while, which is
//   the phone-unlock and window-refocus moment where a restart was the manual
//   workaround anyway;
// - on a back/forward-cache restore, where the tab resumes frozen code that may
//   be several deploys old.
//
// While someone is actually using the app it only reports, and the banner lets
// them pick the moment -- pulling the page out from under a half-filled form is
// worse than showing an old one for another minute.

const POLL_INTERVAL_MS = 15 * 60 * 1000;
const HIDDEN_BEFORE_AUTO_RELOAD_MS = 60 * 1000;

export default function useAppUpdate() {
  const [updateReady, setUpdateReady] = useState(false);
  const hiddenSinceRef = useRef(null);

  const checkForUpdate = useCallback(async () => {
    const deployedBuildId = await fetchDeployedBuildId();
    const isStale = isNewBuildId(deployedBuildId, APP_BUILD_ID);
    if (isStale) setUpdateReady(true);
    return isStale;
  }, []);

  useEffect(() => {
    if (!CAN_CHECK_FOR_UPDATES) return undefined;

    let cancelled = false;

    const check = async ({ reloadNow = false } = {}) => {
      const isStale = await checkForUpdate();
      if (cancelled || !isStale || !reloadNow) return;
      reloadForNewBuild();
    };

    check({ reloadNow: true });

    const intervalId = window.setInterval(() => {
      // A hidden tab is not looking at the banner, and it gets its own check on
      // the way back in.
      if (document.visibilityState !== "hidden") check();
    }, POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
        return;
      }

      const hiddenSince = hiddenSinceRef.current;
      hiddenSinceRef.current = null;
      const wasAwayLongEnough =
        hiddenSince !== null &&
        Date.now() - hiddenSince >= HIDDEN_BEFORE_AUTO_RELOAD_MS;

      check({ reloadNow: wasAwayLongEnough });
    };

    const handlePageShow = (event) => {
      if (event.persisted) check({ reloadNow: true });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [checkForUpdate]);

  return { updateReady };
}
