import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMovieFilterMetadata } from "../lib/movieFilterMetadata";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { supabase } from "../lib/supabase";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { normalizeMpaaRating } from "../utils/movieRatings";
import { normalizeStoredProviderData } from "../utils/tmdbWatchProviders";

export const BOWL_FILTER_METADATA_STATUS = {
  idle: "idle",
  loading: "loading",
  ready: "ready",
  fallback: "fallback",
};

const EMPTY_TMDB_IDS = new Set();

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
    const providerData = normalizeStoredProviderData({
      providers: row.providers || [],
      availability: row.provider_availability || {},
      watchUrl: row.provider_watch_url || null,
      region: row.region || "US",
      fetchedAt: row.fetched_at,
    });
    metadataByTmdbId.set(tmdbId, {
      details: createRatingDetails(certification),
      certification,
      ...providerData,
    });
  });
  return metadataByTmdbId;
}

// How long the read sent on opening a bowl may stand in for the movie list that
// arrives after it. It went out beside that list, so it describes the same
// bowl; past this it may predate an add, and a fresh read is cheaper to reason
// about than a stale one.
const OPENING_READ_MAX_AGE_MS = 15000;

function readBowlMetadata(supabaseClient, bowlId) {
  return supabaseClient
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

// The opening read serves the first movie list its bowl loads and nothing
// after: a later list means the bowl changed, which is what a re-read is for.
function claimOpeningRead(opening, bowlId, cacheKey) {
  if (!opening || opening.bowlId !== bowlId) return null;
  if (opening.servedKey !== null && opening.servedKey !== cacheKey) return null;
  if (Date.now() - opening.startedAt > OPENING_READ_MAX_AGE_MS) return null;
  opening.servedKey = cacheKey;
  return opening.promise;
}

function createBowlMetadataLoader(supabaseClient, bowlId, cacheKey) {
  let promise;
  return {
    cacheKey,
    // Takes over a read already in flight instead of sending its own. Only
    // before the first load: after that the loader has its answer.
    adopt(openingRead) {
      const adopted = claimOpeningRead(openingRead, bowlId, cacheKey);
      if (!promise && adopted) promise = adopted;
    },
    load() {
      if (!bowlId) {
        return Promise.resolve({ metadataByTmdbId: new Map(), total: 0, error: null });
      }
      if (!promise) promise = readBowlMetadata(supabaseClient, bowlId);
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
  // Which titles the cache can answer for is a fact about tmdb ids, not about
  // the pool that asked, so it is held apart from the keyed snapshot and
  // outlives the reload that adding a movie triggers.
  const [cachedTmdbIds, setCachedTmdbIds] = useState({ bowlId: null, ids: EMPTY_TMDB_IDS });
  const tmdbIdsKey = useMemo(
    () => Array.from(new Set((movies || []).map(getPositiveTmdbId).filter(Boolean)))
      .sort((a, b) => a - b)
      .join(","),
    [movies]
  );
  const loaderKey = `${bowlId || ""}:${tmdbIdsKey}`;
  // The cache read needs only the bowl id, so a bowl opened before its movies
  // have loaded sends it now rather than a round trip later, once the list it
  // is keyed on arrives. Every readout that prices the pool waits on it.
  const openingReadRef = useRef(null);
  const loader = useMemo(
    () => createBowlMetadataLoader(supabaseClient, bowlId, tmdbIdsKey),
    [supabaseClient, bowlId, tmdbIdsKey]
  );

  useEffect(() => {
    // Only while the list is still unknown. Movies already in hand mean the
    // keyed read below is about to go out anyway.
    if (!bowlId || tmdbIdsKey) return;
    if (openingReadRef.current?.bowlId === bowlId) return;
    openingReadRef.current = {
      bowlId,
      promise: readBowlMetadata(supabaseClient, bowlId),
      startedAt: Date.now(),
      servedKey: null,
    };
  }, [supabaseClient, bowlId, tmdbIdsKey]);

  useEffect(() => {
    let active = true;
    if (!bowlId || !tmdbIdsKey) return undefined;
    loader.adopt(openingReadRef.current);
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
      // A failed read is not evidence that nothing is cached, so it leaves the
      // ids it could not refresh alone.
      if (!error) setCachedTmdbIds({ bowlId, ids: new Set(metadataByTmdbId.keys()) });
    });
    return () => {
      active = false;
    };
  }, [bowlId, loader, loaderKey, tmdbIdsKey]);

  const getCachedMetadata = useCallback(
    async (tmdbId) => {
      const numericId = Number(tmdbId);
      if (!Number.isInteger(numericId) || numericId <= 0) return null;
      loader.adopt(openingReadRef.current);
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

  // A read that is still in flight keeps the ids the last one resolved, so a
  // reload does not blank the answer. A read that failed does not: the loader
  // now behind these fetchers holds no rows, and every title it was asked for
  // goes to the network after all.
  const knownCachedTmdbIds =
    cachedTmdbIds.bowlId === bowlId &&
    currentSnapshot.status !== BOWL_FILTER_METADATA_STATUS.fallback
      ? cachedTmdbIds.ids
      : EMPTY_TMDB_IDS;
  // Answers for one title rather than for the whole bowl: the callers price a
  // count by the lookups it would actually send, and a title the cache already
  // holds sends none.
  const isMetadataCached = useCallback(
    (tmdbId) => knownCachedTmdbIds.has(Number(tmdbId)),
    [knownCachedTmdbIds]
  );

  return useMemo(() => ({
    status: currentSnapshot.status,
    // Until the cache read answers, nothing is known to be cached, so every
    // title looks like a lookup. Counts read this to wait for it rather than
    // pricing the bowl as uncached and asking to be tapped.
    isMetadataPending: currentSnapshot.status === BOWL_FILTER_METADATA_STATUS.loading,
    cachedCount: currentSnapshot.cachedCount,
    totalCount: currentSnapshot.totalCount,
    isMetadataCached,
    fetchMovieDetails,
    fetchProviders,
    fetchFilterMetadata,
  }), [
    currentSnapshot.status,
    currentSnapshot.cachedCount,
    currentSnapshot.totalCount,
    isMetadataCached,
    fetchMovieDetails,
    fetchProviders,
    fetchFilterMetadata,
  ]);
}
