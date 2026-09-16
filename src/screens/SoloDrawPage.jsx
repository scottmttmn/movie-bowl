import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import useAutosave from "../hooks/useAutosave";
import { MPAA_RATING_OPTIONS } from "../utils/movieRatings";
import useAuth from "../hooks/useAuth";
import useSoloDrawPool from "../hooks/useSoloDrawPool";
import useSoloDraw from "../hooks/useSoloDraw";
import useDrawProviderLinks from "../hooks/useDrawProviderLinks";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import useDeviceDrawSettings from "../hooks/useDeviceDrawSettings";
import useDrawPoolCount, { DRAW_POOL_STATUS } from "../hooks/useDrawPoolCount";
import AddMovieModal from "../components/AddMovieModal";
import DrawAnimationModal from "../components/DrawAnimationModal";
import HoldToDrawButton from "../components/HoldToDrawButton";
import BowlIllustration from "../components/BowlIllustration";
import SoloDrawDialog from "../components/SoloDrawDialog";
import SoloDrawFilters from "../components/SoloDrawFilters";
import ConfirmDialog from "../components/ConfirmDialog";
import TheaterPreroll from "../components/TheaterPreroll";
import TheaterTicket from "../components/TheaterTicket";
import { WEB_SURFACE_DEFAULTS } from "../utils/deviceDrawSettings";
import { buildDrawFiltersFromSettings, clampTheaterTrailerCount } from "../utils/drawSettings";
import {
  buildSoloPreviewPool,
  filterSoloPoolByScope,
  groupSoloCandidatesByTitle,
  getSoloDrawGroups,
} from "../utils/soloDrawSelection";
import { buildTrailerQueue, readRecentTrailerKeys, rememberTrailerKeys } from "../utils/theaterQueue";
import { fetchMovieTrailer, resolveEligiblePreviewIds } from "../lib/theaterPreviews";
import { getTmdbMovieDetails } from "../lib/tmdbApi";
import { fetchStreamingProviders } from "../lib/streamingProviders";
import { fetchMovieFilterMetadata } from "../lib/movieFilterMetadata";
import { matchUserServices } from "../utils/streamingServices";
import { getAutoStartMode, getAutoStartSurface, resolvePreferredLaunchTarget } from "../utils/webLaunch";
import { getPosterUrl } from "../utils/getPosterUrl";

const DRAW_ANIMATION_MINIMUM_MS = 1500;
const SOLO_FILTER_METADATA_FETCHERS = {
  fetchMovieDetails: getTmdbMovieDetails,
  fetchProviders: fetchStreamingProviders,
  fetchFilterMetadata: fetchMovieFilterMetadata,
};

function getAvailableGenres(rows) {
  const genres = new Set();
  rows.forEach((row) => {
    if (!Array.isArray(row?.genres)) return;
    row.genres.forEach((genre) => {
      const value = typeof genre === "string" ? genre.trim() : genre?.name ? String(genre.name).trim() : "";
      if (value) genres.add(value);
    });
  });
  return [...genres].sort((left, right) => left.localeCompare(right));
}

export default function SoloDrawPage() {
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const [searchParams] = useSearchParams();
  const requestedBowlId = searchParams.get("bowl");

  const { rows, bowls, bowlIds, isLoading, errorMessage: poolErrorMessage, reload } =
    useSoloDrawPool(userId);
  const { streamingServices, defaultDrawSettings, setDefaultDrawSettings, saveDefaultDrawSettings,
    loading: preferencesLoading, loadError: preferencesError, reloadStreamingServices } = useUserStreamingServices();
  const {
    settings,
    setOverride: setDeviceOverride,
    setOverrides: setDeviceOverrides,
    isPersisted,
  } = useDeviceDrawSettings(userId, defaultDrawSettings, WEB_SURFACE_DEFAULTS);

  const { status: filterSaveStatus, retry: retryFilters } = useAutosave({
    value: defaultDrawSettings,
    save: saveDefaultDrawSettings,
    enabled: !preferencesLoading && !preferencesError,
  });
  const setOverrides = (patch) => {
    const devicePatch = Object.fromEntries(Object.entries(patch).filter(([key]) => ["prioritizeStreaming", "useStreamingRank"].includes(key)));
    const accountPatch = Object.fromEntries(Object.entries(patch).filter(([key]) => !["prioritizeStreaming", "useStreamingRank"].includes(key)));
    if (Object.keys(devicePatch).length) setDeviceOverrides(devicePatch);
    if (Object.keys(accountPatch).length) setDefaultDrawSettings({ ...defaultDrawSettings, ...accountPatch });
  };
  const setOverride = (key, value) => setOverrides({ [key]: value });

  // Scope is derived until someone changes it, so a pool that arrives late
  // still gets the entry point's answer without an effect racing the render.
  const [scopeOverride, setScopeOverride] = useState(null);
  // Arriving from a bowl is a statement about context, but only while that bowl
  // is still one of yours -- otherwise the scope would start empty with nothing
  // on screen explaining why.
  const entryScope = useMemo(
    () =>
      requestedBowlId && bowlIds.includes(requestedBowlId) ? [requestedBowlId] : bowlIds,
    [bowlIds, requestedBowlId]
  );
  const activeBowlIds = useMemo(
    () => scopeOverride ?? entryScope,
    [scopeOverride, entryScope]
  );
  const scopedRows = useMemo(
    () => filterSoloPoolByScope(rows, activeBowlIds),
    [rows, activeBowlIds]
  );
  const availableGenres = useMemo(() => getAvailableGenres(rows), [rows]);
  const filters = useMemo(
    () =>
      buildDrawFiltersFromSettings(settings, {
        userStreamingServices: streamingServices,
        availableGenres,
      }),
    [settings, streamingServices, availableGenres]
  );

  const {
    status: poolStatus,
    poolCount,
    eligibleMovieIds,
    runLookups,
  } = useDrawPoolCount(scopedRows, filters);
  const {
    draw,
    retrySave,
    dismissResult,
    clearError,
    isDrawing,
    result,
    errorMessage: drawErrorMessage,
    canRetrySave,
  } = useSoloDraw();
  const [showFilters, setShowFilters] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isConfirmingDraw, setIsConfirmingDraw] = useState(false);
  const [isPreparingReveal, setIsPreparingReveal] = useState(false);
  const [drawAnimationTitle, setDrawAnimationTitle] = useState("");
  const [detailMovie, setDetailMovie] = useState(null);
  const [trailerQueue, setTrailerQueue] = useState([]);
  const [isTheaterPlaying, setIsTheaterPlaying] = useState(false);
  const theaterRequestRef = useRef(0);

  // The hook commits before it publishes `result`. Suppress that raw result
  // while the page holds the minimum animation and prepares the same detail
  // card the bowl uses; a pre-existing result still renders immediately in
  // tests and on any future restored in-memory flow.
  const revealedMovie = detailMovie || (!isPreparingReveal ? result : null);
  const providerBowlId = revealedMovie?.bowl_id || result?.bowl_id || null;
  const providerMovie = revealedMovie || result;
  const { providerLinks, startLookup: startProviderLookup } = useDrawProviderLinks(
    providerBowlId,
    providerMovie
  );
  const isTheaterModeEnabled = Boolean(settings.theaterModeEnabled);
  const theaterTrailerCount = clampTheaterTrailerCount(settings.theaterTrailerCount);
  const revealedMovieMatchingProviders = useMemo(
    () =>
      revealedMovie
        ? matchUserServices(revealedMovie.streamingProviders || [], streamingServices)
        : [],
    [revealedMovie, streamingServices]
  );
  const preferredWebLaunchCandidate = useMemo(() => {
    if (!revealedMovie || !settings.enablePreferredWebLaunch) return null;
    if (revealedMovieMatchingProviders.length === 0) return null;

    return resolvePreferredLaunchTarget({
      providerLinks,
      userServices: streamingServices,
      movieProviders: revealedMovie.streamingProviders || [],
      title: revealedMovie.title || "",
    });
  }, [
    revealedMovie,
    settings.enablePreferredWebLaunch,
    revealedMovieMatchingProviders,
    providerLinks,
    streamingServices,
  ]);

  const toggleBowl = (bowlId) => {
    setScopeOverride((previous) => {
      const current = previous ?? entryScope;
      return current.includes(bowlId)
        ? current.filter((id) => id !== bowlId)
        : [...current, bowlId];
    });
  };

  const emptyMessage = (() => {
    if (isLoading || poolErrorMessage) return "";
    if (bowls.length === 0 || rows.length === 0) {
      return "You have no movies to draw. Add a movie to a bowl to get started.";
    }
    if (activeBowlIds.length === 0) return "Choose at least one bowl.";
    if (scopedRows.length === 0) {
      return "You have no movies in these bowls. Choose another bowl or add a movie.";
    }
    return "";
  })();
  const filteredOut = poolStatus === DRAW_POOL_STATUS.ready && poolCount === 0;
  const isDrawInProgress = isDrawing || isPreparingReveal;
  const canDraw = !isLoading && !preferencesLoading && !preferencesError && !isDrawInProgress && !canRetrySave && !emptyMessage && !poolErrorMessage && !filteredOut && scopedRows.length > 0;
  const allSelected = bowlIds.length > 0 && bowlIds.every((id) => activeBowlIds.includes(id));
  const scopeLabel = activeBowlIds.length === 0 ? "no bowls selected" : allSelected
    ? "across all your bowls" : bowls.filter((bowl) => activeBowlIds.includes(bowl.id)).map((bowl) => bowl.name).join(" · ");
  const initial = (session?.user?.user_metadata?.display_name || session?.user?.user_metadata?.full_name || session?.user?.email || "You").slice(0, 1).toUpperCase();
  const totalTitles = groupSoloCandidatesByTitle(scopedRows).length;
  const resolvedRows = eligibleMovieIds ? scopedRows.filter((row) => eligibleMovieIds.includes(row.id)) : scopedRows;
  const drawCount = getSoloDrawGroups(resolvedRows).length;
  const readout = poolStatus === DRAW_POOL_STATUS.manual
    ? `${totalTitles} titles in scope. Check filter matches to preview your draw.`
    : poolStatus === DRAW_POOL_STATUS.counting
      ? "Checking which titles match your filters…"
      : `Drawing from ${filteredOut ? 0 : drawCount} of ${totalTitles} of your titles`;
  const hasFilters = filters.prioritizeByServices || settings.selectedRatings.length < MPAA_RATING_OPTIONS.length || !settings.includeUnknownRatings
    || settings.selectedGenres !== null || !settings.includeUnknownGenres || settings.runtimeMinMinutes > 0
    || settings.runtimeMaxMinutes < 500 || !settings.includeUnknownRuntime;
  const buildDetailMovie = async (movie) => {
    const tmdbId = Number(movie?.tmdb_id ?? movie?.id);
    const watchedOn = movie?.watched_on ?? movie?.watchedOn ?? null;
    const shouldFetchTmdbDetails = Number.isInteger(tmdbId) && tmdbId > 0;

    if (!shouldFetchTmdbDetails) {
      return {
        ...movie,
        watched_on: watchedOn,
        streamingProviders: movie?.streamingProviders || [],
        streamingProviderLogos: movie?.streamingProviderLogos || {},
        streamingRegion: movie?.streamingRegion || "US",
        streamingFetchedAt: movie?.streamingFetchedAt || null,
      };
    }

    const existingProviderData = {
      providers: movie?.streamingProviders || [],
      providerLogos: movie?.streamingProviderLogos || {},
      region: movie?.streamingRegion || "US",
      fetchedAt: movie?.streamingFetchedAt || null,
    };
    const [detailsResult, providersResult] = await Promise.allSettled([
      getTmdbMovieDetails(tmdbId),
      fetchStreamingProviders(tmdbId),
    ]);

    if (detailsResult.status === "rejected") {
      console.error("[SoloDrawPage] Failed to load TMDB detail enrichment", detailsResult.reason);
    }
    if (providersResult.status === "rejected") {
      console.error("[SoloDrawPage] Failed to load streaming provider enrichment", providersResult.reason);
    }

    const details = detailsResult.status === "fulfilled" ? detailsResult.value : null;
    const providerData =
      providersResult.status === "fulfilled" ? providersResult.value : existingProviderData;

    return {
      ...(details || {}),
      ...movie,
      watched_on: watchedOn,
      streamingProviders: providerData.providers || [],
      streamingProviderLogos: providerData.providerLogos || {},
      streamingRegion: providerData.region || "US",
      streamingFetchedAt: providerData.fetchedAt || null,
    };
  };

  const startTheater = async (drawn, drawPool, drawOptions) => {
    const requestId = ++theaterRequestRef.current;

    try {
      const eligibleMovieIds = await resolveEligiblePreviewIds({
        movies: drawPool,
        drawOptions,
        fetchers: SOLO_FILTER_METADATA_FETCHERS,
      });
      const previewPool = buildSoloPreviewPool(drawPool, {
        eligibleMovieIds,
        excludeMovie: drawn,
      });
      const queue = await buildTrailerQueue({
        movies: previewPool.movies,
        eligibleMovieIds: previewPool.eligibleMovieIds,
        excludeMovieId: drawn.id,
        count: theaterTrailerCount,
        recentKeys: readRecentTrailerKeys(),
        fetchTrailer: fetchMovieTrailer,
      });
      if (queue.length === 0 || requestId !== theaterRequestRef.current) return;

      rememberTrailerKeys(queue.map((entry) => entry.trailer?.key));
      setTrailerQueue(queue);
      setIsTheaterPlaying(true);
    } catch (error) {
      console.error("[SoloDrawPage] Failed to start the pre-roll", error);
    }
  };

  const endTheater = () => {
    setIsTheaterPlaying(false);
    setTrailerQueue([]);
  };

  const autoStartCandidate =
    getAutoStartMode({
      surface: getAutoStartSurface({
        userAgent: window.navigator?.userAgent,
        hasFinePointer: Boolean(window.matchMedia?.("(pointer: fine)")?.matches),
      }),
      launchCandidate: preferredWebLaunchCandidate,
    }) === "navigate"
      ? preferredWebLaunchCandidate
      : null;

  const completeTheater = () => {
    if (!autoStartCandidate || document.visibilityState === "hidden") {
      endTheater();
      return;
    }

    window.addEventListener("pageshow", endTheater, { once: true });
    window.location.assign(autoStartCandidate.url);
  };

  const closeReveal = () => {
    theaterRequestRef.current += 1;
    endTheater();
    setDetailMovie(null);
    dismissResult();
  };

  const revealCommittedDraw = async (drawAction, drawPool, drawOptions) => {
    setDrawAnimationTitle("");
    setIsPreparingReveal(true);
    const minimumAnimation = new Promise((resolve) =>
      window.setTimeout(resolve, DRAW_ANIMATION_MINIMUM_MS)
    );

    try {
      const movie = await drawAction();
      if (movie?.title) setDrawAnimationTitle(movie.title);
      if (movie) startProviderLookup(movie);

      const [preparedMovie] = await Promise.all([
        movie ? buildDetailMovie(movie) : Promise.resolve(null),
        minimumAnimation,
      ]);
      if (!preparedMovie) return;

      setDetailMovie(preparedMovie);
      if (isTheaterModeEnabled) {
        startTheater(preparedMovie, drawPool, drawOptions);
      }
    } finally {
      setIsPreparingReveal(false);
      setDrawAnimationTitle("");
    }
  };

  const runDraw = () => {
    if (!canDraw) return;
    setIsConfirmingDraw(false);
    const drawPool = [...scopedRows];
    const drawOptions = { ...filters };
    void revealCommittedDraw(
      () => draw(drawPool, drawOptions),
      drawPool,
      drawOptions
    );
  };

  const runSaveRetry = () => {
    if (!canRetrySave || isDrawInProgress) return;
    const drawPool = [...scopedRows];
    const drawOptions = { ...filters };
    void revealCommittedDraw(retrySave, drawPool, drawOptions);
  };

  return (
    <div className="page-container solo-draw-page py-6 sm:py-8">
      <div className="solo-draw-layout">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[26px] font-bold tracking-tight text-slate-50">Solo Draw</h1>
            <span className="text-sm text-slate-400">{scopeLabel}</span>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" className="icon-btn relative" aria-label="Filters" aria-haspopup="dialog" onClick={() => setShowFilters(true)}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
              {hasFilters && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-violet-400" />}
            </button>
            <Link to="/settings" className="icon-btn" aria-label="Your settings" title="Your settings">⚙️</Link>
          </div>
        </header>

        <section className="solo-draw-hero" aria-label="Draw for yourself">
          <div className="relative flex items-center justify-between gap-3">
            <p className="solo-eyebrow">Solo draw</p>
            <span className="solo-identity"><span className="solo-avatar">{initial}</span>Just you</span>
          </div>
          <div className="relative flex flex-col items-center pt-5 text-center">
            <div className="solo-bowl-stage">
              <BowlIllustration
                className="h-full w-full"
                drawTitle={drawAnimationTitle}
                isDrawing={isDrawInProgress}
              />
              <span className="solo-avatar solo-bowl-avatar" aria-hidden="true">{initial}</span>
            </div>
            {isLoading ? <p className="mt-4 text-sm text-slate-400" role="status">Loading your movies…</p> : poolErrorMessage ? (
              <div className="panel-muted status-error mt-4" role="alert">
                <p>{poolErrorMessage}</p><button type="button" className="btn btn-secondary mt-3" onClick={reload}>Retry</button>
              </div>
            ) : (
              <div className="mt-4 text-sm text-slate-300">
                <p role="status">{emptyMessage || (filteredOut ? "No titles match your filters. Adjust your filters to draw." : readout)}
                  <button type="button" className="solo-info-button" aria-label="How solo draw picks" onClick={() => setShowInfo(true)}>i</button>
                </p>
                {poolStatus === DRAW_POOL_STATUS.manual && !emptyMessage && <button type="button" className="btn btn-secondary mt-3" onClick={runLookups}>Check filter matches</button>}
                {filteredOut && <button type="button" className="btn btn-secondary mt-3" onClick={() => setShowFilters(true)}>Adjust filters</button>}
              </div>
            )}
            <div className="solo-draw-action mt-5 w-full max-w-sm">
              <HoldToDrawButton label="Hold to draw for yourself" ariaLabel="Draw a movie for yourself. Press and hold to draw."
                onHoldComplete={runDraw} onKeyboardActivate={() => { if (canDraw) setIsConfirmingDraw(true); }}
                disabled={!canDraw} isLoading={isDrawInProgress} />
            </div>
            <div className="mt-3 flex justify-center">
              <TheaterTicket
                enabled={isTheaterModeEnabled}
                onToggle={(next) => setDeviceOverride("theaterModeEnabled", next)}
              />
            </div>
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-slate-400">Only titles you added. Goes straight to your watch history — your bowls keep their copies.</p>
          </div>
        </section>

        {(preferencesError || filterSaveStatus === "error") && <div className="panel-muted status-error" role="alert">
          <p>{preferencesError ? "Could not load your draw preferences." : "Could not save your filters."}</p>
          <button type="button" className="btn btn-secondary mt-2" onClick={preferencesError ? reloadStreamingServices : retryFilters}>Retry filters</button>
        </div>}
        {drawErrorMessage && <div className="panel-muted status-error flex items-center justify-between gap-3" role="alert">
          <span>{drawErrorMessage}</span>
          {canRetrySave ? <button type="button" className="btn btn-secondary" onClick={runSaveRetry} disabled={isDrawInProgress}>Retry</button>
            : <button type="button" className="btn btn-ghost" onClick={clearError}>Dismiss</button>}
        </div>}

        {!isLoading && !poolErrorMessage && bowls.length > 0 && <section className="solo-pool-panel" aria-labelledby="solo-scope-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="solo-scope-title" className="font-bold text-slate-100">Drawing from</h2><p className="text-xs text-slate-500">Your movies across bowls</p></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="solo-scope-chip solo-all-bowls" aria-pressed={allSelected} onClick={() => setScopeOverride(bowlIds)}>All bowls<span>{rows.length}</span></button>
            {bowls.map((bowl) => <button key={bowl.id} type="button" className="solo-scope-chip"
              aria-pressed={activeBowlIds.includes(bowl.id)} aria-label={`${bowl.name}, ${bowl.titleCount} ${bowl.titleCount === 1 ? "title" : "titles"}`}
              onClick={() => toggleBowl(bowl.id)}>{bowl.name}<span>{bowl.titleCount}</span></button>)}
          </div>
        </section>}

        {!isLoading && !poolErrorMessage && scopedRows.length > 0 && <section className="solo-pool-panel" aria-labelledby="solo-pool-title">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 id="solo-pool-title" className="font-bold text-slate-100">In your pool</h2><span className="text-sm text-slate-400">{totalTitles} undrawn titles you added</span></div>
          <ul className="solo-poster-strip" tabIndex={0} aria-label="Movies in selected bowls">
            {scopedRows.map((movie) => <li key={movie.id} className="solo-poster-card">
              <img src={getPosterUrl(movie, "w185")} alt="" loading="lazy" />
              <p className="mt-2 text-xs leading-snug text-slate-300">{movie.title}</p>
              <p className="mt-1 text-[11px] text-slate-500">{bowls.find((bowl) => bowl.id === movie.bowl_id)?.name}</p>
            </li>)}
          </ul>
        </section>}
      </div>
      {showFilters && <SoloDrawFilters settings={settings} setOverride={setOverride} setOverrides={setOverrides}
        streamingServices={streamingServices} availableGenres={availableGenres} isPersisted={isPersisted}
        saveStatus={filterSaveStatus} onRetry={retryFilters} disabled={Boolean(preferencesLoading || preferencesError)} readout={readout} onClose={() => setShowFilters(false)} />}
      {showInfo && <SoloDrawDialog title="How solo draw picks" onClose={() => setShowInfo(false)}>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">Only your undrawn titles in the selected bowls take part. Your pinned movies go first when they match your filters. Each eligible pinned title has an equal chance; without pins, each eligible title has an equal chance.</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">Copies of the same movie get one chance across bowls. Custom titles stay separate. Your bowls keep their copies and pins, so repeat picks are possible.</p>
        <button type="button" className="btn btn-secondary mt-5 w-full" onClick={() => setShowInfo(false)}>Got it</button>
      </SoloDrawDialog>}

      {isDrawInProgress && <DrawAnimationModal />}

      <ConfirmDialog
        isOpen={isConfirmingDraw}
        title="Draw a movie for yourself?"
        body="It goes straight to your watch history. Your bowls keep their copies."
        confirmLabel="Draw"
        onKeep={() => setIsConfirmingDraw(false)}
        onConfirm={() => {
          setIsConfirmingDraw(false);
          runDraw();
        }}
      />

      {isTheaterPlaying && revealedMovie && (
        <TheaterPreroll
          queue={trailerQueue}
          featureTitle={revealedMovie.title || ""}
          featureServiceName={autoStartCandidate?.serviceName}
          onFinish={endTheater}
          onComplete={completeTheater}
        />
      )}
      {revealedMovie && (
        <AddMovieModal
          movie={revealedMovie}
          isObscured={isTheaterPlaying}
          userStreamingServices={streamingServices}
          webLaunchCandidate={settings.enablePreferredWebLaunch ? preferredWebLaunchCandidate : null}
          detailPrimaryActionNote="Saved to your watch history."
          onClose={closeReveal}
        />
      )}
    </div>
  );
}
