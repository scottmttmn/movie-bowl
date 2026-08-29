import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMovieFilterMetadata } from "../lib/movieFilterMetadata";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { supabase } from "../lib/supabase";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { normalizeMpaaRating } from "../utils/movieRatings";
import { normalizeStreamingServices } from "../utils/streamingServices";

export const BOWL_FILTER_METADATA_STATUS = {
  idle: "idle",
  loading: "loading",
  ready: "ready",
  fallback: "fallback",
};

const defaultFetchMovieDetails = (tmdbId) => getTmdbMovieDetails(tmdbId);
const defaultFetchProviders = (tmdbId) => fetchStreamingProviders(tmdbId, { region: "US" });
const defaultFetchFilterMetadata = (tmdbId) => fetchMovieFilterMetadata(tmdbId);

function getPositiveTmdbId(movie) {
  const tmdbId = Number(movie?.tmdb_id);
  return Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null;
}

function createRatingDetails(certification) {
  if (!certification) return { release_dates: { results: [] } };
  return {
    release_dates: {
      results: [
        {
          iso_3166_1: "US",
          release_dates: [{ certification }],
        },
      ],
    },
  };
}

function normalizeCacheRows(rows) {
  const metadataByTmdbId = new Map();
  (rows || []).forEach((row) => {
    const tmdbId = Number(row?.tmdb_id);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !row?.fetched_at) return;
    const certification = normalizeMpaaRating(row.certification);
    metadataByTmdbId.set(tmdbId, {
      details: createRatingDetails(certification),
      certification,
      providers: normalizeStreamingServices(row.providers || []),
      region: row.region || "US",
      fetchedAt: row.fetched_at,
    });
  });
  return metadataByTmdbId;
}

function createBowlMetadataLoader(supabaseClient, bowlId, cacheKey) {
  let promise;
  return {
    cacheKey,
    load() {
      if (!bowlId) {
        return Promise.resolve({ metadataByTmdbId: new Map(), total: 0, error: null });
      }
      if (!promise) {
        promise = supabaseClient
          .rpc("get_bowl_filter_metadata", {
            p_bowl_id: bowlId,
            p_region: "US",
          })
          .then(({ data, error }) => ({
            metadataByTmdbId: error ? new Map() : normalizeCacheRows(data),
            total: error ? 0 : (data || []).length,
            error: error || null,
          }))
          .catch((error) => ({
            metadataByTmdbId: new Map(),
            total: 0,
            error,
          }));
      }
      return promise;
    },
  };
}

export default function useBowlFilterMetadata(
  bowlId,
  movies,
  {
    supabaseClient = supabase,
    fetchMovieDetailsFallback = defaultFetchMovieDetails,
    fetchProvidersFallback = defaultFetchProviders,
    fetchFilterMetadataFallback = defaultFetchFilterMetadata,
  } = {}
) {
  const [snapshot, setSnapshot] = useState({
    key: null,
    status: BOWL_FILTER_METADATA_STATUS.idle,
    cachedCount: 0,
    totalCount: 0,
  });
  const tmdbIdsKey = useMemo(
    () => Array.from(new Set((movies || []).map(getPositiveTmdbId).filter(Boolean)))
      .sort((a, b) => a - b)
      .join(","),
    [movies]
  );
  const loaderKey = `${bowlId || ""}:${tmdbIdsKey}`;
  const expectedTmdbCount = tmdbIdsKey ? tmdbIdsKey.split(",").length : 0;
  const loader = useMemo(
    () => createBowlMetadataLoader(supabaseClient, bowlId, tmdbIdsKey),
    [supabaseClient, bowlId, tmdbIdsKey]
  );

  useEffect(() => {
    let active = true;
    if (!bowlId || !tmdbIdsKey) return undefined;
    loader.load().then(({ metadataByTmdbId, total, error }) => {
      if (!active) return;
      if (error) {
        console.error("[useBowlFilterMetadata] Failed to load persistent metadata", error);
      }
      setSnapshot({
        key: loaderKey,
        status: error
          ? BOWL_FILTER_METADATA_STATUS.fallback
          : BOWL_FILTER_METADATA_STATUS.ready,
        cachedCount: metadataByTmdbId.size,
        totalCount: total,
      });
    });
    return () => {
      active = false;
    };
  }, [bowlId, loader, loaderKey, tmdbIdsKey]);

  const getCachedMetadata = useCallback(
    async (tmdbId) => {
      const numericId = Number(tmdbId);
      if (!Number.isInteger(numericId) || numericId <= 0) return null;
      const { metadataByTmdbId } = await loader.load();
      return metadataByTmdbId.get(numericId) || null;
    },
    [loader]
  );

  const fetchMovieDetails = useCallback(async (tmdbId) => {
    const metadata = await getCachedMetadata(tmdbId);
    return metadata?.details || fetchMovieDetailsFallback(tmdbId);
  }, [fetchMovieDetailsFallback, getCachedMetadata]);

  const fetchProviders = useCallback(async (tmdbId) => {
    const metadata = await getCachedMetadata(tmdbId);
    return metadata || fetchProvidersFallback(tmdbId, { region: "US" });
  }, [fetchProvidersFallback, getCachedMetadata]);

  const fetchFilterMetadata = useCallback(async (tmdbId) => {
    const metadata = await getCachedMetadata(tmdbId);
    return metadata || fetchFilterMetadataFallback(tmdbId);
  }, [fetchFilterMetadataFallback, getCachedMetadata]);

  const currentSnapshot = snapshot.key === loaderKey
    ? snapshot
    : {
        status: bowlId
          ? tmdbIdsKey
            ? BOWL_FILTER_METADATA_STATUS.loading
            : BOWL_FILTER_METADATA_STATUS.ready
          : BOWL_FILTER_METADATA_STATUS.idle,
        cachedCount: 0,
        totalCount: 0,
      };

  const hasCompleteMetadataSnapshot =
    currentSnapshot.status === BOWL_FILTER_METADATA_STATUS.ready &&
    currentSnapshot.cachedCount === expectedTmdbCount;

  return useMemo(() => ({
    status: currentSnapshot.status,
    cachedCount: currentSnapshot.cachedCount,
    totalCount: currentSnapshot.totalCount,
    hasCompleteMetadataSnapshot,
    fetchMovieDetails,
    fetchProviders,
    fetchFilterMetadata,
  }), [
    currentSnapshot.status,
    currentSnapshot.cachedCount,
    currentSnapshot.totalCount,
    hasCompleteMetadataSnapshot,
    fetchMovieDetails,
    fetchProviders,
    fetchFilterMetadata,
  ]);
}
