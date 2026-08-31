import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import useUserBowls from "../hooks/useUserBowls";

export default function HomeRedirect() {
  const { error: contextError, refresh } = useUserBowls();
  const [destination, setDestination] = useState(null);
  const [resolutionError, setResolutionError] = useState(null);
  const error = contextError || resolutionError;
  const resolve = useCallback(() => refresh().then((context) => {
    if (context) setDestination(context.defaultBowlId ? `/bowl/${context.defaultBowlId}` : "/bowls");
    else setResolutionError("Could not load your bowls. Please try again.");
  }), [refresh]);
  useEffect(() => { void resolve(); }, [resolve]);
  if (destination) return <Navigate to={destination} replace />;
  return (
    <div className="page-container py-10">
      <div className="panel mx-auto max-w-lg space-y-3 text-sm text-slate-400">
        <p role={error ? "alert" : "status"}>{error || "Loading your bowls…"}</p>
        {error && <div className="flex gap-3">
          <button className="btn btn-secondary" onClick={resolve}>Retry</button>
          <Link className="btn btn-ghost" to="/bowls">My Bowls</Link>
        </div>}
      </div>
    </div>
  );
}
