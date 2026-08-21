import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { getDrawCandidates, isRatingFilterExhaustive } from "../utils/drawSelection";
import { getDrawablePoolMovies, summarizeContributorReach } from "../utils/drawPool";
import { getStreamingPriorityPool } from "../utils/selectDrawCandidate";

// Ratings are not stored on bowl_movies, so a narrowed rating filter costs one
// TMDB lookup per title that survives the free filters. Same trade-off as the
// streaming match chip: small bowls resolve on their own, past this we wait for
// a tap rather than firing hundreds of requests.
export const AUTO_LOOKUP_TITLE_LIMIT = 100;

export const DRAW_POOL_STATUS = {
  unfiltered: "unfiltered",
  manual: "manual",
  counting: "counting",
  ready: "ready",
};

const EMPTY_REACH = { totalCount: 0, reachedCount: 0, excludedNames: [] };
const EMPTY_STREAMING_MATCH = {
  matchCount: null,
  topService: null,
  topServiceCount: 0,
};

// Module-level so the identity is stable: this lands in the effect's deps, and
// a fresh closure per render would re-run the count forever.
const defaultFetchMovieDetails = (tmdbId) => getTmdbMovieDetails(tmdbId);
const defaultFetchProviders = (tmdbId) => fetchStreamingProviders(tmdbId);

function countLookupEligibleTitles(movies) {
  return movies.reduce((count, movie) => {
    const tmdbId = Number(movie?.tmdb_id);
    return count + (Number.isFinite(tmdbId) && tmdbId > 0 ? 1 : 0);
  }, 0);
}

/**
 * Counts the titles a draw could actually reach under the current settings,
 * and which contributors are still represented in that pool. Streaming
 * priority deliberately runs after the ordinary filters here, just as it does
 * in getDrawSelection.
 */
export default function useDrawPoolCount(
  movies,
  filters,
  {
    fetchMovieDetails = defaultFetchMovieDetails,
    fetchProviders = defaultFetchProviders,
    autoLookupLimit = AUTO_LOOKUP_TITLE_LIMIT,
  } = {}
) {
  const [result, setResult] = useState(null);
  const [isCounting, setIsCounting] = useState(false);
  const [didRequestLookup, setDidRequestLookup] = useState(false);
  const runTokenRef = useRef(0);

  // Held in a ref rather than the effect's deps: a caller that rebuilds this
  // closure each render would otherwise restart the count on every render it
  // causes. What the pool count depends on is the movies and the filters.
  const fetchMovieDetailsRef = useRef(fetchMovieDetails);
  fetchMovieDetailsRef.current = fetchMovieDetails;
  const fetchProvidersRef = useRef(fetchProviders);
  fetchProvidersRef.current = fetchProviders;

  const poolMovies = useMemo(() => getDrawablePoolMovies(movies), [movies]);
  const poolKey = poolMovies.map((movie) => movie.id).join(",");

  const ratingFilter = filters?.ratingFilter ?? null;
  const genreFilter = filters?.genreFilter ?? null;
  const runtimeFilter = filters?.runtimeFilter ?? null;
  const prioritizeByServices = Boolean(filters?.prioritizeByServices);
  const prioritizeByServiceRank = filters?.prioritizeByServiceRank !== false;
  const userStreamingServices = filters?.userStreamingServices || [];
  const canPrioritizeStreaming = prioritizeByServices && userStreamingServices.length > 0;
  const filtersKey = JSON.stringify({
    ratingFilter,
    genreFilter,
    runtimeFilter,
    prioritizeByServices,
    prioritizeByServiceRank,
    userStreamingServices,
  });
  const countKey = `${poolKey}:${filtersKey}`;

  // An exhaustive rating filter is dropped rather than run: it removes nothing,
  // and skipping it is the difference between a free count and a TMDB lookup
  // for every title in the bowl.
  const ratingFilterForCount = isRatingFilterExhaustive(ratingFilter) ? null : ratingFilter;
  const lookupEligibleTitleCount = countLookupEligibleTitles(poolMovies);
  const needsLookups =
    lookupEligibleTitleCount > 0 &&
    (Boolean(ratingFilterForCount) || canPrioritizeStreaming);

  // A different question deserves a fresh opt-in.
  useEffect(() => {
    setDidRequestLookup(false);
  }, [filtersKey]);

  const shouldCount =
    poolMovies.length > 0 &&
    (!needsLookups || lookupEligibleTitleCount <= autoLookupLimit || didRequestLookup);

  useEffect(() => {
    runTokenRef.current += 1;
    const runToken = runTokenRef.current;

    if (!shouldCount) {
      setIsCounting(false);
      setResult(null);
      return undefined;
    }

    setIsCounting(true);
    const countPool = async () => {
      const { candidates: filteredCandidates } = await getDrawCandidates({
        remainingMovies: poolMovies,
        ratingFilter: ratingFilterForCount,
        genreFilter,
        runtimeFilter,
        fetchMovieDetails: fetchMovieDetailsRef.current,
        ratingLast: true,
      });

      if (!canPrioritizeStreaming) {
        return {
          candidates: filteredCandidates,
          streamingMatch: EMPTY_STREAMING_MATCH,
        };
      }

      const streamingPool = await getStreamingPriorityPool(filteredCandidates, {
        prioritizeByServiceRank,
        userStreamingServices,
        fetchProviders: fetchProvidersRef.current,
      });
      return {
        candidates: streamingPool.candidates.map((candidate) => candidate?.movie || candidate),
        streamingMatch: {
          matchCount: streamingPool.matchCount,
          topService: streamingPool.topService,
          topServiceCount: streamingPool.topServiceCount,
        },
      };
    };

    countPool().then(({ candidates, streamingMatch }) => {
      if (runTokenRef.current !== runToken) return;

      setResult({
        countKey,
        poolCount: candidates.length,
        reach: summarizeContributorReach(poolMovies, candidates),
        streamingMatch,
      });
      setIsCounting(false);
    });

    return () => {
      runTokenRef.current += 1;
    };
    // poolKey and filtersKey stand in for the array and object identities, which
    // are rebuilt on every bowl reload and every filter render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldCount, poolKey, filtersKey]);

  const runLookups = useCallback(() => {
    setDidRequestLookup(true);
  }, []);

  const totalCount = poolMovies.length;
  const currentResult = result?.countKey === countKey ? result : null;
  const poolCount = currentResult ? currentResult.poolCount : null;
  const reach = currentResult ? currentResult.reach : EMPTY_REACH;
  const streamingMatch = currentResult
    ? currentResult.streamingMatch
    : EMPTY_STREAMING_MATCH;

  const status = (() => {
    if (totalCount === 0) return DRAW_POOL_STATUS.unfiltered;
    if (!shouldCount) return DRAW_POOL_STATUS.manual;
    if (isCounting || poolCount === null) return DRAW_POOL_STATUS.counting;
    // Nothing was removed, so there is no second number worth showing.
    if (poolCount === totalCount) return DRAW_POOL_STATUS.unfiltered;
    return DRAW_POOL_STATUS.ready;
  })();

  return {
    status,
    poolCount,
    totalCount,
    contributorReach: status === DRAW_POOL_STATUS.ready ? reach : EMPTY_REACH,
    streamingMatch,
    runLookups,
  };
}
