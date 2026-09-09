import { useSyncExternalStore } from "react";
import { isRouteLoading, subscribeToRouteLoading } from "../utils/routeLoading";

/**
 * A thin bar across the top while a screen's code is downloading.
 *
 * It sits outside the Suspense boundary on purpose. Inside it, the update
 * would be part of the same suspended tree it is trying to report on and
 * could not commit until the wait was already over.
 */
export default function RouteProgressBar() {
  const loading = useSyncExternalStore(subscribeToRouteLoading, isRouteLoading, () => false);
  if (!loading) return null;

  return (
    <div className="route-progress" role="status">
      <span className="route-progress-bar" />
      <span className="sr-only">Loading page…</span>
    </div>
  );
}
