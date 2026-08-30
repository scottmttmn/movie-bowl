import { useCallback, useEffect, useState } from "react";
import { fetchProviderLinks } from "../lib/providerLinks";

export default function useDrawProviderLinks(bowlId, movie) {
  const [request, setRequest] = useState(null);
  const [result, setResult] = useState(null);
  const tmdbId = Number(movie?.tmdb_id ?? request?.tmdbId);
  const startLookup = useCallback((drawn) => {
    setResult(null);
    setRequest({ tmdbId: drawn?.tmdb_id ?? null });
  }, []);

  useEffect(() => {
    if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) return;
    let cancelled = false;
    fetchProviderLinks(tmdbId, bowlId).then(({ links }) => {
      if (!cancelled) setResult({ bowlId, tmdbId, links });
    });
    return () => { cancelled = true; };
  }, [bowlId, tmdbId, request]);

  return {
    startLookup,
    providerLinks: result?.bowlId === bowlId && result?.tmdbId === Number(movie?.tmdb_id)
      ? result.links : [],
  };
}
