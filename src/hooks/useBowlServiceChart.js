import { useEffect, useMemo, useState } from "react";
import { subscribeBowlChanges } from "../lib/bowlChanges";
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
  const [revision, setRevision] = useState(0);

  // Installing or removing a starter pack happens on the same page, so the
  // chart has to hear about it rather than wait for the next visit. The old
  // bars stay up while the new read is out.
  useEffect(() => subscribeBowlChanges((change) => {
    if (change.bowlId !== bowlId) return;
    if (change.type === "add" && change.phase !== "success") return;
    setRevision((current) => current + 1);
  }), [bowlId]);

  useEffect(() => {
    if (!bowlId) return undefined;
    let cancelled = false;
    readBowlMetadata(supabase, bowlId).then((result) => {
      if (!cancelled) setRead({ bowlId, ...result });
    });
    return () => { cancelled = true; };
  }, [bowlId, revision]);

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

  // total is every title the cache should know about; the chart only sees the
  // ones it has checked, so the two are reported apart.
  return {
    status,
    chart,
    totalCount: current?.total || 0,
    uncheckedCount: current ? Math.max(0, current.total - current.metadataByTmdbId.size) : 0,
  };
}
