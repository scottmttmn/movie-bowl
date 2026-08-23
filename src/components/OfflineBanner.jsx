import { useEffect, useState } from "react";
import useOnlineStatus from "../hooks/useOnlineStatus";

const RECONNECTED_VISIBLE_MS = 4000;

// Explains a dropped connection once, globally, so individual screens do not
// each have to guess why their own request failed. It sits at the bottom of the
// viewport rather than under the fixed top nav: the nav's spacer is a fixed
// height, and routes like TV and public add links render without a nav at all.
export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [previousIsOnline, setPreviousIsOnline] = useState(isOnline);
  const [showReconnected, setShowReconnected] = useState(false);

  // Derive the recovery notice from the transition itself, during render. Only
  // a real offline -> online flip counts, so mounting while online never
  // announces a recovery the user never lost.
  if (previousIsOnline !== isOnline) {
    setPreviousIsOnline(isOnline);
    setShowReconnected(isOnline);
  }

  useEffect(() => {
    if (!showReconnected) return undefined;

    const timeoutId = window.setTimeout(
      () => setShowReconnected(false),
      RECONNECTED_VISIBLE_MS
    );

    return () => window.clearTimeout(timeoutId);
  }, [showReconnected]);

  if (isOnline && !showReconnected) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4"
      data-testid="offline-banner"
    >
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto w-full max-w-md text-center shadow-lg shadow-black/30 ${
          isOnline ? "status-success" : "status-warning"
        }`}
      >
        {isOnline
          ? "Back online."
          : "You're offline. Nothing will save until you reconnect."}
      </div>
    </div>
  );
}
