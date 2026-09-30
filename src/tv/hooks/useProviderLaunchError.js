import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_MESSAGE = "That streaming app could not be opened on this TV.";

// The Google TV shell reports a failed hand-off with a message and nothing
// else, so the screen remembers what it last sent out -- a pressed link or an
// auto-start -- and files the failure under that. Otherwise a credit link the
// shell cannot open would disable a rent or Open button that works fine.
export default function useProviderLaunchError() {
  const [launchError, setLaunchError] = useState(null);
  const lastLaunchUrlRef = useRef(null);

  const noteLaunch = useCallback((url) => {
    lastLaunchUrlRef.current = url || null;
  }, []);

  const clearLaunchError = useCallback(() => {
    setLaunchError(null);
  }, []);

  useEffect(() => {
    const handleClick = (event) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (link) lastLaunchUrlRef.current = link.href;
    };
    const handleLaunchError = (event) => {
      setLaunchError({
        message: event?.detail?.message || DEFAULT_MESSAGE,
        url: lastLaunchUrlRef.current,
      });
    };

    window.addEventListener("click", handleClick, true);
    window.addEventListener("moviebowl:provider-launch-error", handleLaunchError);
    return () => {
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("moviebowl:provider-launch-error", handleLaunchError);
    };
  }, []);

  return { launchError, clearLaunchError, noteLaunch };
}
