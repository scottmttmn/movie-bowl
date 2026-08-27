import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { fetchMovieFilterMetadata } from "../lib/movieFilterMetadata";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import {
  getLocallyFilteredCandidates,
  isRatingFilterExhaustive,
} from "../utils/drawSelection";
import { resolveMyMovieEligibility } from "../utils/myMovieEligibility";

export const AUTO_MY_MOVIE_ELIGIBILITY_LIMIT = 100;

export const MY_MOVIE_ELIGIBILITY_STATUS = {
  idle: "idle",
  manual: "manual",
  checking: "checking",
  ready: "ready",
};

const defaultFetchMovieDetails = (tmdbId) => getTmdbMovieDetails(tmdbId);
const defaultFetchProviders = (tmdbId) => fetchStreamingProviders(tmdbId, { region: "US" });
const defaultFetchFilterMetadata = (tmdbId) => fetchMovieFilterMetadata(tmdbId);

function getPositiveTmdbId(movie) {
  const tmdbId = Number(movie?.tmdb_id);
  return Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null;
}

export default function useMyMovieEligibility(
  remainingMovies,
  myMovies,
  filters,
  {
    enabled = false,
    fetchMovieDetails = defaultFetchMovieDetails,
    fetchProviders = defaultFetchProviders,
    fetchFilterMetadata = defaultFetchFilterMetadata,
    autoLookupLimit = AUTO_MY_MOVIE_ELIGIBILITY_LIMIT,
    sharedEligibleMovieIds = null,
    isSharedEligibilityPending = false,
  } = {}
) {
  const [result, setResult] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [requestedLookupKey, setRequestedLookupKey] = useState(null);
  const runTokenRef = useRef(0);

  const fetchMovieDetailsRef = useRef(fetchMovieDetails);
  fetchMovieDetailsRef.current = fetchMovieDetails;
  const fetchProvidersRef = useRef(fetchProviders);
  fetchProvidersRef.current = fetchProviders;
  const fetchFilterMetadataRef = useRef(fetchFilterMetadata);
  fetchFilterMetadataRef.current = fetchFilterMetadata;

  const persistedMovies = useMemo(
    () => (remainingMovies || []).filter((movie) => movie && movie.local_status !== "syncing"),
    [remainingMovies]
  );
  const persistedMyMovies = useMemo(
    () => (myMovies || []).filter((movie) => movie && movie.local_status !== "syncing"),
    [myMovies]
  );
  const myMovieIds = useMemo(
    () => persistedMyMovies.map((movie) => movie.id),
    [persistedMyMovies]
  );
  const sharedEligibleMyMovieIds = useMemo(() => {
    if (!Array.isArray(sharedEligibleMovieIds)) return null;
    const sharedEligibleIds = new Set(sharedEligibleMovieIds);
    return myMovieIds.filter((movieId) => sharedEligibleIds.has(movieId));
  }, [myMovieIds, sharedEligibleMovieIds]);
  const hasSharedEligibility = sharedEligibleMyMovieIds !== null;

  const ratingFilter = filters?.ratingFilter ?? null;
  const genreFilter = filters?.genreFilter ?? null;
  const runtimeFilter = filters?.runtimeFilter ?? null;
  const prioritizeByServices = Boolean(filters?.prioritizeByServices);
  const prioritizeByServiceRank = filters?.prioritizeByServiceRank !== false;
  const userStreamingServices = filters?.userStreamingServices || [];
  const needsRatingLookups = !isRatingFilterExhaustive(ratingFilter);
  const needsStreamingLookups = prioritizeByServices && userStreamingServices.length > 0;
  const locallyEligibleMyMovies = useMemo(
    () => getLocallyFilteredCandidates(persistedMyMovies, { genreFilter, runtimeFilter }),
    [persistedMyMovies, genreFilter, runtimeFilter]
  );
  const ownLookupTitleCount = locallyEligibleMyMovies.reduce(
    (count, movie) => count + (getPositiveTmdbId(movie) ? 1 : 0),
    0
  );
  const needsLookups =
    ownLookupTitleCount > 0 && (needsRatingLookups || needsStreamingLookups);

  const moviesKey = persistedMovies
    .map((movie) => `${movie.id}:${movie.tmdb_id}:${movie.runtime}:${JSON.stringify(movie.genres || [])}`)
    .join(",");
  const myMovieIdsKey = myMovieIds.join(",");
  const filtersKey = JSON.stringify({
    ratingFilter,
    genreFilter,
    runtimeFilter,
    prioritizeByServices,
    prioritizeByServiceRank,
    userStreamingServices,
  });
  const eligibilityKey = `${moviesKey}:${myMovieIdsKey}:${filtersKey}`;
  const didRequestLookup = requestedLookupKey === eligibilityKey;
  const shouldResolve =
    enabled &&
    !hasSharedEligibility &&
    !isSharedEligibilityPending &&
    (!needsLookups || ownLookupTitleCount <= autoLookupLimit || didRequestLookup);

  useEffect(() => {
    runTokenRef.current += 1;
    const runToken = runTokenRef.current;

    if (!shouldResolve) {
      setIsChecking(false);
      setResult(null);
      return undefined;
    }

    setIsChecking(true);
    resolveMyMovieEligibility({
      remainingMovies: persistedMovies,
      myMovieIds,
      prioritizeByServices,
      prioritizeByServiceRank,
      userStreamingServices,
      ratingFilter,
      genreFilter,
      runtimeFilter,
      fetchMovieDetails: fetchMovieDetailsRef.current,
      fetchProviders: fetchProvidersRef.current,
      fetchFilterMetadata: fetchFilterMetadataRef.current,
    })
      .then((eligibleMovieIds) => {
        if (runTokenRef.current !== runToken) return;
        setResult({ eligibilityKey, eligibleMovieIds });
        setIsChecking(false);
      })
      .catch((error) => {
        if (runTokenRef.current !== runToken) return;
        console.error("[useMyMovieEligibility] Failed to resolve filter matches", error);
        setResult(null);
        setIsChecking(false);
      });

    return () => {
      runTokenRef.current += 1;
    };
    // Stable keys stand in for the bowl/filter object identities, matching the
    // other eligibility readouts on this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldResolve, eligibilityKey]);

  const runLookups = useCallback(() => {
    setRequestedLookupKey(eligibilityKey);
  }, [eligibilityKey]);

  const currentResult = result?.eligibilityKey === eligibilityKey ? result : null;
  const status = (() => {
    if (!enabled) return MY_MOVIE_ELIGIBILITY_STATUS.idle;
    if (hasSharedEligibility) return MY_MOVIE_ELIGIBILITY_STATUS.ready;
    if (isSharedEligibilityPending) return MY_MOVIE_ELIGIBILITY_STATUS.checking;
    if (!shouldResolve) return MY_MOVIE_ELIGIBILITY_STATUS.manual;
    if (isChecking) return MY_MOVIE_ELIGIBILITY_STATUS.checking;
    if (currentResult) return MY_MOVIE_ELIGIBILITY_STATUS.ready;
    return MY_MOVIE_ELIGIBILITY_STATUS.idle;
  })();

  return {
    status,
    eligibleMovieIds: sharedEligibleMyMovieIds || currentResult?.eligibleMovieIds || [],
    runLookups,
  };
}
