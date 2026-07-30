import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { getLastOpenedBowlId } from "../utils/lastOpenedBowl";

// Returning users almost always want the bowl they were last in, so "/" resolves
// a destination rather than rendering the list. A remembered bowl id is read
// straight from local storage, which makes the common case an immediate redirect
// with no query first. Everything else falls through to the full list at
// /bowls, and a stale id is caught by the dashboard's own access check.
export default function HomeRedirect() {
  const { session } = useAuth();
  const userId = session?.user?.id || "";
  const rememberedBowlId = getLastOpenedBowlId(userId);
  const [resolvedDestination, setResolvedDestination] = useState("");

  useEffect(() => {
    if (rememberedBowlId) return undefined;

    let cancelled = false;

    const resolveDestination = async () => {
      const { data, error } = await supabase.rpc("get_my_bowls_with_counts");

      if (cancelled) return;

      if (error) {
        console.error("[HomeRedirect] Failed to load bowls", error);
        setResolvedDestination("/bowls");
        return;
      }

      // With a single bowl there is nothing to choose between, so skip the list.
      const rows = data || [];
      setResolvedDestination(rows.length === 1 ? `/bowl/${rows[0].id}` : "/bowls");
    };

    resolveDestination();

    return () => {
      cancelled = true;
    };
  }, [rememberedBowlId]);

  if (rememberedBowlId) {
    return <Navigate to={`/bowl/${rememberedBowlId}`} replace />;
  }

  if (!resolvedDestination) {
    return (
      <div className="page-container py-10">
        <div className="panel mx-auto max-w-lg text-sm text-slate-400" role="status">
          Loading…
        </div>
      </div>
    );
  }

  return <Navigate to={resolvedDestination} replace />;
}
