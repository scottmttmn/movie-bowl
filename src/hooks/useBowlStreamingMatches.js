import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { matchUserServices } from "../utils/streamingServices";

// Providers are not stored on bowl_movies, so every title costs one TMDB
// lookup. Small bowls scan on their own; past this we wait for a tap rather
// than firing hundreds of requests at page load.
export const AUTO_SCAN_TITLE_LIMIT = 60;

const MAX_CONCURRENT_LOOKUPS = 6;

export const STREAMING_MATCH_STATUS = {
  unavailable: "unavailable",
  manual: "manual",
  scanning: "scanning",
  ready: "ready",
};

function getPositiveTmdbId(movie) {
  const numericId = Number(movie?.tmdb_id ?? movie?.id);
  return Number.isInteger(numericId) && numericId > 0 ? numericId : null;
}

async function runWithConcurrency(items, worker, limit) {
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });

  await Promise.all(runners);
}

export default function useBowlStreamingMatches(
  movies,
  userStreamingServices,
  { fetchProviders = fetchStreamingProviders, autoScanLimit = AUTO_SCAN_TITLE_LIMIT } = {}
) {
  const [matchCount, setMatchCount] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [didRequestScan, setDidRequestScan] = useState(false);
  const runTokenRef = useRef(0);

  const hasServices = (userStreamingServices || []).length > 0;
  const servicesKey = useMemo(
    () => (userStreamingServices || []).join("|"),
    [userStreamingServices]
  );

  const tmdbIds = useMemo(() => {
    if (!hasServices) return [];
    const seen = new Set();
    (movies || []).forEach((movie) => {
      const tmdbId = getPositiveTmdbId(movie);
      if (tmdbId) seen.add(tmdbId);
    });
    return Array.from(seen);
  }, [movies, hasServices]);
  const tmdbIdsKey = tmdbIds.join(",");

  // A ranking change is a different question; make the user opt back in.
  useEffect(() => {
    setDidRequestScan(false);
  }, [servicesKey]);

  const shouldScan =
    hasServices && tmdbIds.length > 0 && (tmdbIds.length <= autoScanLimit || didRequestScan);

  useEffect(() => {
    runTokenRef.current += 1;
    const runToken = runTokenRef.current;

    if (!shouldScan) {
      setIsScanning(false);
      setMatchCount(null);
      return undefined;
    }

    setIsScanning(true);
    let matches = 0;

    // fetchStreamingProviders resolves to an empty provider list when a lookup
    // fails, so a flaky request undercounts rather than breaking the chip.
    const countMatches = async (tmdbId) => {
      const providerData = await fetchProviders(tmdbId, { region: "US" });
      if (runTokenRef.current !== runToken) return;
      const matched = matchUserServices(providerData?.providers || [], userStreamingServices);
      if (matched.length > 0) matches += 1;
    };

    runWithConcurrency(tmdbIds, countMatches, MAX_CONCURRENT_LOOKUPS).then(() => {
      if (runTokenRef.current !== runToken) return;
      setMatchCount(matches);
      setIsScanning(false);
    });

    return () => {
      runTokenRef.current += 1;
    };
    // tmdbIdsKey and servicesKey stand in for the array identities, which are
    // rebuilt on every bowl reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldScan, tmdbIdsKey, servicesKey, fetchProviders]);

  const scan = useCallback(() => {
    setDidRequestScan(true);
  }, []);

  const status = (() => {
    if (!hasServices || tmdbIds.length === 0) return STREAMING_MATCH_STATUS.unavailable;
    if (!shouldScan) return STREAMING_MATCH_STATUS.manual;
    if (isScanning || matchCount === null) return STREAMING_MATCH_STATUS.scanning;
    return STREAMING_MATCH_STATUS.ready;
  })();

  return {
    status,
    matchCount,
    eligibleCount: tmdbIds.length,
    scan,
  };
}
