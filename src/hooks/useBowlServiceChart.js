import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { buildBowlServiceChart } from "../utils/bowlServiceChart";
import { readBowlMetadata } from "./useBowlFilterMetadata";
import useUserStreamingServices from "./useUserStreamingServices";

// The bowl's streaming chart, read from the same daily availability cache the
// draw filters use, so it costs no TMDB calls. It waits for both the cache and
// the viewer's services: a chart drawn before it knows which services are
// yours would colour every bar as one you lack.
export default function useBowlServiceChart(bowlId) {
  const { streamingServices, loading: servicesLoading, loadError: servicesError } = useUserStreamingServices();
  const [read, setRead] = useState(null);

  useEffect(() => {
    if (!bowlId) return undefined;
    let cancelled = false;
    readBowlMetadata(supabase, bowlId).then((result) => {
      if (!cancelled) setRead({ bowlId, ...result });
    });
    return () => { cancelled = true; };
  }, [bowlId]);

  const current = read?.bowlId === bowlId ? read : null;
  const status = !current || servicesLoading
    ? "loading"
    : current.error || servicesError ? "error" : "ready";

  const chart = useMemo(
    () => (status === "ready"
      ? buildBowlServiceChart({ metadataByTmdbId: current.metadataByTmdbId, userServices: streamingServices })
      : null),
    [status, current, streamingServices]
  );

  return {
    status,
    chart,
    uncheckedCount: current ? Math.max(0, current.total - current.metadataByTmdbId.size) : 0,
  };
}
