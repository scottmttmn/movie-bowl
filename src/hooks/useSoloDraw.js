import { useCallback, useRef, useState } from "react";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { fetchMovieFilterMetadata } from "../lib/movieFilterMetadata";
import {
  createSoloDrawRequestId,
  fetchSoloDrawRemovedCopies,
  recordSoloDraw,
} from "../lib/soloDraw";
import { getResolvedDrawPool } from "../utils/drawSelection";
import { getMovieFromDrawCandidate, hydrateDrawCandidate } from "../utils/selectDrawCandidate";
import { selectSoloDrawCandidate } from "../utils/soloDrawSelection";

const EMPTY_POOL_MESSAGE = "You have no movies to draw.";
const UNEXPECTED_ERROR = "Could not draw a movie. Please try again.";

const defaultFetchMovieDetails = (tmdbId) => getTmdbMovieDetails(tmdbId);
const defaultFetchProviders = (tmdbId) => fetchStreamingProviders(tmdbId);
const defaultFetchFilterMetadata = (tmdbId) => fetchMovieFilterMetadata(tmdbId);

/**
 * Draws one of your own titles and commits it before anyone sees it.
 *
 * Revealing a solo draw is what commits it, so the save has to happen first:
 * showing the pick and then failing to record it would make the reveal a lie,
 * and offering a redraw after a failure would turn the draw into a browser.
 * A failed save keeps the same request id and offers a retry, which the RPC
 * answers with the original entry if the first attempt actually landed.
 */
export default function useSoloDraw({
  fetchMovieDetails = defaultFetchMovieDetails,
  fetchProviders = defaultFetchProviders,
  fetchFilterMetadata = defaultFetchFilterMetadata,
  randomFn = Math.random,
} = {}) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const pendingRef = useRef(null);

  const commit = useCallback(async (candidate, requestId) => {
    const movie = getMovieFromDrawCandidate(candidate);
    const saved = await recordSoloDraw(movie.id, requestId);

    if (!saved.ok) {
      // Hold the pick and its id so Retry finishes this draw rather than
      // starting another one.
      pendingRef.current = { candidate, requestId };
      setErrorMessage(saved.message);
      return null;
    }

    pendingRef.current = null;
    // The setting that empties your bowls is the account's, not this screen's,
    // so the reveal asks the server what it actually removed rather than
    // predicting it. Nothing removed is the ordinary case and says nothing.
    const removedCopies = await fetchSoloDrawRemovedCopies(saved.event.id);
    const hydrated = await hydrateDrawCandidate(candidate, fetchProviders);
    const drawn = {
      ...getMovieFromDrawCandidate(hydrated),
      streamingProviders: hydrated?.providers || [],
      streamingProviderLogos: hydrated?.providerLogos || {},
      streamingAvailability: hydrated?.availability || {},
      streamingWatchUrl: hydrated?.watchUrl || null,
      streamingProviderStatus: hydrated?.providerStatus || "ready",
      streamingRegion: hydrated?.region || "US",
      streamingFetchedAt: hydrated?.fetchedAt || null,
      watchEventId: saved.event.id,
      watchedOn: saved.event.watched_on,
      removedCopies,
    };

    setResult(drawn);
    return drawn;
  }, [fetchProviders]);

  const draw = useCallback(async (movies, filters = {}) => {
    if (isDrawing) return null;

    setIsDrawing(true);
    setErrorMessage("");

    try {
      const { candidates, errorMessage: poolError } = await getResolvedDrawPool({
        remainingMovies: movies || [],
        prioritizeByServices: Boolean(filters.prioritizeByServices),
        prioritizeByServiceRank: filters.prioritizeByServiceRank !== false,
        userStreamingServices: filters.userStreamingServices || [],
        ratingFilter: filters.ratingFilter || null,
        genreFilter: filters.genreFilter || null,
        runtimeFilter: filters.runtimeFilter || null,
        fetchProviders,
        fetchMovieDetails,
        fetchFilterMetadata,
      });

      if (poolError) {
        setErrorMessage(poolError);
        return null;
      }

      const candidate = selectSoloDrawCandidate(candidates, { randomFn });
      if (!candidate) {
        setErrorMessage(EMPTY_POOL_MESSAGE);
        return null;
      }

      return await commit(candidate, createSoloDrawRequestId());
    } catch (error) {
      console.error("[useSoloDraw] Unexpected error drawing solo", error);
      setErrorMessage(UNEXPECTED_ERROR);
      return null;
    } finally {
      setIsDrawing(false);
    }
  }, [commit, fetchFilterMetadata, fetchMovieDetails, fetchProviders, isDrawing, randomFn]);

  const retrySave = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || isDrawing) return null;

    setIsDrawing(true);
    setErrorMessage("");

    try {
      return await commit(pending.candidate, pending.requestId);
    } catch (error) {
      console.error("[useSoloDraw] Unexpected error saving a solo draw", error);
      setErrorMessage(UNEXPECTED_ERROR);
      return null;
    } finally {
      setIsDrawing(false);
    }
  }, [commit, isDrawing]);

  const dismissResult = useCallback(() => {
    // Closing the result does not undo the draw. It is already in history, and
    // history is where undo lives.
    setResult(null);
  }, []);

  const clearError = useCallback(() => {
    pendingRef.current = null;
    setErrorMessage("");
  }, []);

  return {
    draw,
    retrySave,
    dismissResult,
    clearError,
    isDrawing,
    result,
    errorMessage,
    canRetrySave: Boolean(pendingRef.current) && Boolean(errorMessage),
  };
}
