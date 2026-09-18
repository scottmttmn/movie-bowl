import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BowlIllustration from "../../components/BowlIllustration";
import useDeviceDrawSettings from "../../hooks/useDeviceDrawSettings";
import useDrawPoolCount, { DRAW_POOL_STATUS } from "../../hooks/useDrawPoolCount";
import useDrawProviderLinks from "../../hooks/useDrawProviderLinks";
import useSoloDraw from "../../hooks/useSoloDraw";
import useSoloDrawPool from "../../hooks/useSoloDrawPool";
import useUserStreamingServices from "../../hooks/useUserStreamingServices";
import { fetchMovieFilterMetadata } from "../../lib/movieFilterMetadata";
import { fetchStreamingProviders } from "../../lib/streamingProviders";
import { fetchMovieTrailer, resolveEligiblePreviewIds } from "../../lib/theaterPreviews";
import { getTmdbMovieDetails } from "../../lib/tmdbApi";
import { clampTheaterTrailerCount } from "../../utils/drawSettings";
import { getProviderLogoUrl } from "../../utils/getProviderLogoUrl";
import { getServiceLogoPath } from "../../utils/providerLogos";
import { getStreamingMode, getStreamingModeSettings } from "../utils/streamingMode";
import {
  buildSoloPreviewPool,
  filterSoloPoolByScope,
  groupSoloCandidatesByTitle,
} from "../../utils/soloDrawSelection";
import {
  buildTrailerQueue,
  readRecentTrailerKeys,
  rememberTrailerKeys,
} from "../../utils/theaterQueue";
import {
  getAutoStartMode,
  getAutoStartSurface,
  resolvePreferredLaunchTarget,
} from "../../utils/webLaunch";
import TvBrand from "../components/TvBrand";
import TvSoloScopeSheet from "../components/TvSoloScopeSheet";
import { TvDrawingScreen, TvRevealScreen } from "../components/TvDrawExperience";
import TvTheaterPreroll from "../components/TvTheaterPreroll";
import TvTheaterTicket from "../components/TvTheaterTicket";
import useTvSpatialNavigation from "../hooks/useTvSpatialNavigation";
import {
  clearExternalReturn,
  readExternalReturn,
  rememberExternalReturn,
} from "../utils/externalReturn";
import {
  buildTvDrawOptions,
  getAvailableDrawGenres,
} from "../utils/drawOptions";

const MIN_DRAW_ANIMATION_MS = 1800;
const MAX_PREVIEW_WAIT_MS = 2500;
const SOLO_RETURN_KEY = "solo";
// Enough to show the set without turning the line into a logo parade.
const MAX_SUMMARY_SERVICE_LOGOS = 3;

const SOLO_FILTER_METADATA_FETCHERS = {
  fetchMovieDetails: getTmdbMovieDetails,
  fetchProviders: fetchStreamingProviders,
  fetchFilterMetadata: fetchMovieFilterMetadata,
  // Same reason as the group stage: this screen has no opt-in to offer either,
  // and a pool it declined to count is one the line below simply cannot state.
  autoRunLookups: true,
};

async function enrichSoloMovie(movie) {
  const tmdbId = Number(movie?.tmdb_id ?? movie?.id);
  const watchedOn = movie?.watched_on ?? movie?.watchedOn ?? null;
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return { ...movie, watched_on: watchedOn };
  }

  const existingProviderData = {
    providers: movie?.streamingProviders || [],
    providerLogos: movie?.streamingProviderLogos || {},
    availability: movie?.streamingAvailability || {},
    watchUrl: movie?.streamingWatchUrl || null,
    status: movie?.streamingProviderStatus || "unavailable",
    region: movie?.streamingRegion || "US",
    fetchedAt: movie?.streamingFetchedAt || null,
  };
  const [detailsResult, providersResult] = await Promise.allSettled([
    getTmdbMovieDetails(tmdbId),
    fetchStreamingProviders(tmdbId),
  ]);

  if (detailsResult.status === "rejected") {
    console.error("[TvSoloDrawScreen] Failed to load movie details", detailsResult.reason);
  }
  if (providersResult.status === "rejected") {
    console.error("[TvSoloDrawScreen] Failed to load streaming providers", providersResult.reason);
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
    streamingAvailability: providerData.availability || {},
    streamingWatchUrl: providerData.watchUrl || null,
    streamingProviderStatus: providerData.status || "ready",
    streamingRegion: providerData.region || "US",
    streamingFetchedAt: providerData.fetchedAt || null,
  };
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

export default function TvSoloDrawScreen({ userId }) {
  const navigate = useNavigate();
  const {
    rows,
    bowls,
    isLoading: isPoolLoading,
    errorMessage: poolErrorMessage,
    reload,
    removeRows,
  } = useSoloDrawPool(userId);
  const {
    streamingServices,
    defaultDrawSettings: accountDrawSettings,
    loading: isPreferencesLoading,
  } = useUserStreamingServices();
  const {
    settings,
    overriddenSettings,
    isPersisted: areTvSettingsPersisted,
    setOverride: setTvSetting,
    setOverrides: setTvSettings,
  } = useDeviceDrawSettings(userId, accountDrawSettings);
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

  const [showScopeSheet, setShowScopeSheet] = useState(false);
  // Session-only, like the web screen's scope: a television is a shared object,
  // and a bowl somebody excluded on Tuesday must not still be missing when
  // another person draws on Friday.
  const [scopeOverride, setScopeOverride] = useState(null);
  const [showDrawConfirm, setShowDrawConfirm] = useState(false);
  const [isPreparingReveal, setIsPreparingReveal] = useState(false);
  const [drawAnimationTitle, setDrawAnimationTitle] = useState("");
  const [drawnMovie, setDrawnMovie] = useState(() => readExternalReturn(SOLO_RETURN_KEY));
  const [showTrailer, setShowTrailer] = useState(false);
  const [trailerQueue, setTrailerQueue] = useState([]);
  const [isTheaterPending, setIsTheaterPending] = useState(false);
  const [isTheaterPlaying, setIsTheaterPlaying] = useState(false);
  const [providerLaunchMessage, setProviderLaunchMessage] = useState(null);
  const drawInFlightRef = useRef(false);
  const theaterRequestRef = useRef(0);

  const bowlIds = useMemo(() => bowls.map((bowl) => bowl.id), [bowls]);
  const selectedBowlIds = scopeOverride ?? bowlIds;
  const scopedRows = useMemo(
    () => filterSoloPoolByScope(rows, selectedBowlIds),
    [rows, selectedBowlIds]
  );
  const postersByBowl = useMemo(() => {
    const posters = {};
    rows.forEach((row) => {
      if (!row?.bowl_id) return;
      const bowlPosters = posters[row.bowl_id] || (posters[row.bowl_id] = []);
      if (row.poster_path && bowlPosters.length < 3) bowlPosters.push(row);
    });
    return posters;
  }, [rows]);
  const availableGenres = useMemo(
    () => getAvailableDrawGenres(scopedRows),
    [scopedRows]
  );
  const drawOptions = useMemo(
    () => buildTvDrawOptions(settings, streamingServices, availableGenres),
    [settings, streamingServices, availableGenres]
  );
  const {
    status: drawPoolStatus,
    poolCount,
    eligibleMovieIds,
    streamingMatch,
  } = useDrawPoolCount(scopedRows, drawOptions, SOLO_FILTER_METADATA_FETCHERS);
  const distinctTitleCount = useMemo(
    () => groupSoloCandidatesByTitle(scopedRows).length,
    [scopedRows]
  );
  // Counted the same way as the pool it describes: the filters answer in rows,
  // and a row is not a title -- a movie sitting in three bowls survives them
  // three times but still has one chance. Null until the lookups land, because
  // a filtered count that guesses is worse than one that waits.
  const eligibleTitleCount = useMemo(() => {
    if (!Array.isArray(eligibleMovieIds)) return null;
    const eligible = new Set(eligibleMovieIds.map((id) => String(id)));
    return groupSoloCandidatesByTitle(
      scopedRows.filter((row) => eligible.has(String(row.id)))
    ).length;
  }, [eligibleMovieIds, scopedRows]);
  const isFilteredCountReady =
    drawPoolStatus === DRAW_POOL_STATUS.ready &&
    eligibleTitleCount !== null &&
    eligibleTitleCount < distinctTitleCount;
  const streamingMode = getStreamingMode(settings);
  // The service the resolved pool actually landed on, not the account's rank 1.
  // They differ whenever nothing on the top service survives the filters: the
  // draw falls through to the next one down, and a line that showed rank 1
  // regardless would be naming a service the draw is not using. Same value the
  // group stage's rail reads, so the two surfaces cannot disagree.
  const drawingService = streamingMatch?.topService || null;
  // "All" weights every service the same, so there is no service to name -- the
  // line shows the set it is drawing from instead of picking one to stand for
  // the rest.
  const summaryServices = useMemo(() => {
    if (streamingMode === "off") return [];
    if (streamingMode === "all") return streamingServices;
    return drawingService ? [drawingService] : [];
  }, [streamingMode, streamingServices, drawingService]);
  const summaryServiceLogos = useMemo(
    () =>
      summaryServices.slice(0, MAX_SUMMARY_SERVICE_LOGOS).map((service) => ({
        service,
        logoUrl: getProviderLogoUrl(getServiceLogoPath(service), "w92"),
      })),
    [summaryServices]
  );
  const hiddenSummaryServiceCount = Math.max(
    0,
    summaryServices.length - MAX_SUMMARY_SERVICE_LOGOS
  );
  const filteredOut =
    drawPoolStatus === DRAW_POOL_STATUS.ready && poolCount === 0;
  const isBusy = isDrawing || isPreparingReveal;
  const isTheaterModeEnabled = Boolean(settings.theaterModeEnabled);
  const theaterTrailerCount = clampTheaterTrailerCount(settings.theaterTrailerCount);
  const providerMovie = drawnMovie || result;
  const providerBowlId = providerMovie?.bowl_id || null;
  const { providerLinks, startLookup: startProviderLookup } = useDrawProviderLinks(
    providerBowlId,
    providerMovie
  );
  const sourceBowlName =
    bowls.find((bowl) => String(bowl.id) === String(drawnMovie?.bowl_id))?.name || null;
  const preferredWebLaunchCandidate = useMemo(() => {
    if (!drawnMovie) return null;

    return resolvePreferredLaunchTarget({
      providerLinks,
      userServices: streamingServices,
      movieProviders: drawnMovie.streamingProviders || [],
      title: drawnMovie.title || "",
    });
  }, [drawnMovie, providerLinks, streamingServices]);

  const leaveSolo = useCallback(() => {
    clearExternalReturn();
    navigate("/tv/bowls", { state: { focus: "solo" } });
  }, [navigate]);

  const endTheater = useCallback(() => {
    setIsTheaterPlaying(false);
    setIsTheaterPending(false);
    rememberTrailerKeys(trailerQueue.map((item) => item.trailer?.key));
  }, [trailerQueue]);

  const closeReveal = useCallback(() => {
    theaterRequestRef.current += 1;
    clearExternalReturn();
    endTheater();
    setTrailerQueue([]);
    setShowTrailer(false);
    setDrawnMovie(null);
    setProviderLaunchMessage(null);
    dismissResult();
  }, [dismissResult, endTheater]);

  useEffect(() => {
    const handleProviderLaunchError = (event) => {
      setProviderLaunchMessage(
        event?.detail?.message || "That streaming app could not be opened on this TV."
      );
    };

    window.addEventListener("moviebowl:provider-launch-error", handleProviderLaunchError);
    return () => {
      window.removeEventListener("moviebowl:provider-launch-error", handleProviderLaunchError);
    };
  }, []);

  useEffect(
    () => () => {
      theaterRequestRef.current += 1;
    },
    []
  );

  const beginProviderLaunch = useCallback(() => {
    setProviderLaunchMessage(null);
    rememberExternalReturn({ bowlId: SOLO_RETURN_KEY, movie: drawnMovie });
  }, [drawnMovie]);

  const autoStartCandidate =
    getAutoStartMode({
      surface: getAutoStartSurface({ userAgent: window.navigator?.userAgent }),
      launchCandidate: preferredWebLaunchCandidate,
      launchError: providerLaunchMessage,
    }) === "window"
      ? preferredWebLaunchCandidate
      : null;

  const completeTheater = useCallback(() => {
    endTheater();
    if (!autoStartCandidate) return;
    beginProviderLaunch();
    window.open(autoStartCandidate.url, "_blank", "noopener,noreferrer");
  }, [autoStartCandidate, beginProviderLaunch, endTheater]);

  const startTheater = async (movie, drawPool, options) => {
    const requestId = ++theaterRequestRef.current;
    setTrailerQueue([]);
    setIsTheaterPending(true);

    let timeoutId;
    try {
      const queuePromise = resolveEligiblePreviewIds({
        movies: drawPool,
        drawOptions: options,
        fetchers: SOLO_FILTER_METADATA_FETCHERS,
      })
        .then((eligibleMovieIds) =>
          buildSoloPreviewPool(drawPool, {
            eligibleMovieIds,
            excludeMovie: movie,
          })
        )
        .then((previewPool) =>
          buildTrailerQueue({
            movies: previewPool.movies,
            eligibleMovieIds: previewPool.eligibleMovieIds,
            excludeMovieId: movie.id,
            count: theaterTrailerCount,
            recentKeys: readRecentTrailerKeys(),
            fetchTrailer: fetchMovieTrailer,
          })
        );
      const timeoutPromise = new Promise((resolve) => {
        timeoutId = window.setTimeout(() => resolve(null), MAX_PREVIEW_WAIT_MS);
      });
      const queue = await Promise.race([queuePromise, timeoutPromise]);

      if (requestId !== theaterRequestRef.current) return;
      setIsTheaterPending(false);
      if (!Array.isArray(queue) || queue.length === 0) return;
      setTrailerQueue(queue);
      setIsTheaterPlaying(true);
    } catch (error) {
      console.error("[TvSoloDrawScreen] Failed to build the preview queue", error);
      if (requestId === theaterRequestRef.current) setIsTheaterPending(false);
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const revealCommittedDraw = async (drawAction, drawPool, options) => {
    if (drawInFlightRef.current) return;

    drawInFlightRef.current = true;
    clearExternalReturn();
    setShowDrawConfirm(false);
    setDrawAnimationTitle("");
    setProviderLaunchMessage(null);
    setIsPreparingReveal(true);

    const minimumAnimation = new Promise((resolve) =>
      window.setTimeout(resolve, MIN_DRAW_ANIMATION_MS)
    );

    try {
      const movie = await drawAction();
      // The pool is read once and held, so copies the draw removed would sit in
      // it as candidates until this screen is mounted again.
      if (movie) removeRows((movie.removedCopies || []).map((copy) => copy.id));
      if (movie?.title) setDrawAnimationTitle(movie.title);
      if (movie) startProviderLookup(movie);

      const [preparedMovie] = await Promise.all([
        movie ? enrichSoloMovie(movie) : Promise.resolve(null),
        minimumAnimation,
      ]);
      if (!preparedMovie) return;

      setDrawnMovie(preparedMovie);
      if (isTheaterModeEnabled) {
        void startTheater(preparedMovie, drawPool, options);
      }
    } finally {
      drawInFlightRef.current = false;
      setIsPreparingReveal(false);
      setDrawAnimationTitle("");
    }
  };

  const performDraw = () => {
    if (
      isBusy ||
      isPoolLoading ||
      isPreferencesLoading ||
      poolErrorMessage ||
      filteredOut ||
      scopedRows.length === 0
    ) {
      return;
    }

    const drawPool = [...scopedRows];
    const options = { ...drawOptions };
    void revealCommittedDraw(() => draw(drawPool, options), drawPool, options);
  };

  const retryPendingSave = () => {
    if (!canRetrySave || isBusy) return;
    const drawPool = [...scopedRows];
    const options = { ...drawOptions };
    void revealCommittedDraw(retrySave, drawPool, options);
  };

  useTvSpatialNavigation({
    scopeKey: [
      "solo",
      isPoolLoading,
      isPreferencesLoading,
      showDrawConfirm,
      showScopeSheet,
      selectedBowlIds.join(","),
      isBusy,
      drawnMovie?.id || "",
      showTrailer,
      isTheaterPlaying,
      isTheaterPending,
      canRetrySave,
      Boolean(poolErrorMessage),
      Boolean(providerLaunchMessage),
    ].join(":"),
    onBack: () => {
      if (isBusy) return;
      if (isTheaterPlaying) {
        endTheater();
        return;
      }
      if (showScopeSheet) {
        setShowScopeSheet(false);
        return;
      }
      if (showDrawConfirm) {
        setShowDrawConfirm(false);
        return;
      }
      if (showTrailer) {
        setShowTrailer(false);
        return;
      }
      if (canRetrySave) {
        clearError();
        return;
      }
      if (drawnMovie) {
        closeReveal();
        return;
      }
      leaveSolo();
    },
  });

  if (isBusy) {
    return (
      <TvDrawingScreen
        bowlName="Solo draw"
        drawTitle={drawAnimationTitle}
        poolCount={distinctTitleCount}
        totalCount={distinctTitleCount}
        heading="Picking one of yours…"
        caption="Only your titles are in this draw."
      />
    );
  }

  if (drawnMovie) {
    const historyMetadata = [
      sourceBowlName ? `From ${sourceBowlName}` : null,
      "Saved to your Watch History",
    ].filter(Boolean);

    return (
      <>
        <TvRevealScreen
          bowlName="Solo draw"
          movie={drawnMovie}
          streamingServices={streamingServices}
          isPreparingPreviews={isTheaterPending}
          showTrailer={showTrailer}
          isDialogOpen={isTheaterPlaying}
          webLaunchCandidate={preferredWebLaunchCandidate}
          providerLaunchMessage={providerLaunchMessage}
          onProviderLaunch={beginProviderLaunch}
          onCloseTrailer={() => setShowTrailer(false)}
          onToggleTrailer={() => setShowTrailer((current) => !current)}
          kicker="Picked for you"
          badgeLabel="Your pick"
          noteLabel="Your note"
          historyMetadata={historyMetadata}
        />
        {isTheaterPlaying && (
          <TvTheaterPreroll
            queue={trailerQueue}
            featureTitle={drawnMovie.title}
            featureServiceName={autoStartCandidate?.serviceName}
            onFinish={endTheater}
            onComplete={completeTheater}
          />
        )}
      </>
    );
  }

  const drawDisabled =
    isPoolLoading ||
    isPreferencesLoading ||
    Boolean(poolErrorMessage) ||
    filteredOut ||
    rows.length === 0 ||
    canRetrySave;
  const isBehindDialog = showDrawConfirm || canRetrySave || showScopeSheet;

  return (
    <main className="tv-page tv-solo-page">
      <div aria-hidden={isBehindDialog ? "true" : undefined} inert={isBehindDialog}>
        <header className="tv-topbar" data-tv-nav-region="solo-header">
          <TvBrand />
          <button
            type="button"
            className="tv-text-button"
            data-tv-focusable
            data-tv-nav-group="solo-header"
            onClick={leaveSolo}
          >
            ← Choose a bowl
          </button>
        </header>

        <section
          className="tv-solo-stage"
          data-theater={isTheaterModeEnabled ? "true" : undefined}
          aria-labelledby="tv-solo-title"
        >
          <div className="tv-solo-copy">
            <p className="tv-kicker">Solo draw</p>
            <h1 id="tv-solo-title">Pick one of yours.</h1>
            <p>
              One private pick from your movies across every bowl. Shared bowls
              keep their copies.
            </p>
          </div>

          <div className="tv-solo-action" data-tv-nav-region="solo-stage">
            <button
              type="button"
              className="tv-solo-draw-button"
              data-tv-focusable
              data-tv-autofocus={!poolErrorMessage ? "true" : undefined}
              data-tv-nav-group="solo-draw"
              disabled={drawDisabled}
              onClick={() => {
                clearError();
                setShowDrawConfirm(true);
              }}
            >
              <BowlIllustration className="tv-solo-draw-bowl" />
              <span>Draw for myself</span>
            </button>

            {/* The readout is the control. One line says what the draw is
                working from, and selecting it opens the sheet that changes it --
                so the resting screen gains a sentence and a single D-pad stop
                rather than a column of controls beside the draw target. */}
            {!isPoolLoading && !poolErrorMessage && rows.length > 0 && (
              <button
                type="button"
                className="tv-solo-pool-summary"
                data-tv-focusable
                data-tv-nav-group="solo-draw"
                onClick={() => setShowScopeSheet(true)}
              >
                <span>
                  {isFilteredCountReady ? (
                    <>
                      <strong>{eligibleTitleCount}</strong> of{" "}
                      <strong>{distinctTitleCount}</strong>{" "}
                      {pluralize(distinctTitleCount, "title")}
                    </>
                  ) : (
                    <>
                      <strong>{distinctTitleCount}</strong>{" "}
                      {pluralize(distinctTitleCount, "title")}
                    </>
                  )}{" "}
                  across <strong>{selectedBowlIds.length}</strong>{" "}
                  {pluralize(selectedBowlIds.length, "bowl")}
                </span>
                {/* The count is the label; this says what pressing it does,
                    which a sighted person reads from the sheet opening and a
                    screen reader cannot. */}
                <span className="sr-only">Change bowls and streaming</span>
                {summaryServiceLogos.length > 0 && (
                  <span className="tv-solo-summary-service">
                    {summaryServiceLogos.map(({ service, logoUrl }) =>
                      logoUrl ? (
                        <img key={service} src={logoUrl} alt={service} />
                      ) : (
                        <span key={service}>{service}</span>
                      )
                    )}
                    {hiddenSummaryServiceCount > 0 && (
                      <span className="tv-solo-summary-more">
                        +{hiddenSummaryServiceCount}
                      </span>
                    )}
                    {streamingMode === "top" && (
                      <span className="tv-solo-summary-first">first</span>
                    )}
                  </span>
                )}
              </button>
            )}

            {(isPoolLoading || isPreferencesLoading) && (
              <p className="tv-solo-status" role="status">
                Getting your movies ready…
              </p>
            )}
            {poolErrorMessage && (
              <div className="tv-solo-status tv-solo-status-error" role="alert">
                <p>{poolErrorMessage}</p>
                <button
                  type="button"
                  className="tv-button tv-button-secondary"
                  data-tv-focusable
                  data-tv-autofocus="true"
                  onClick={reload}
                >
                  Try again
                </button>
              </div>
            )}
            {!isPoolLoading && !poolErrorMessage && rows.length > 0 && scopedRows.length === 0 && (
              <p className="tv-solo-status">
                No bowls chosen. Open the line above to pick some.
              </p>
            )}
            {!isPoolLoading && !poolErrorMessage && rows.length === 0 && (
              <p className="tv-solo-status">
                You have no movies to draw. Add one from your phone, then come back.
              </p>
            )}
            {!isPoolLoading && !poolErrorMessage && filteredOut && (
              <p className="tv-solo-status">
                Your saved filters leave nothing to draw. Change them on your phone.
              </p>
            )}
            {drawErrorMessage && !canRetrySave && (
              <p className="tv-solo-status tv-solo-status-error" role="alert">
                {drawErrorMessage}
              </p>
            )}

            {!isPreferencesLoading && (
              <TvTheaterTicket
                enabled={isTheaterModeEnabled}
                isOverridden={Object.prototype.hasOwnProperty.call(
                  overriddenSettings,
                  "theaterModeEnabled"
                )}
                onToggle={setTvSetting}
              />
            )}
            {!areTvSettingsPersisted && (
              <p className="tv-stage-warning" role="status">
                This TV can&apos;t remember settings, so these last until it restarts.
              </p>
            )}
          </div>
        </section>
      </div>

      {showScopeSheet && (
        <TvSoloScopeSheet
          bowls={bowls}
          selectedBowlIds={selectedBowlIds}
          postersByBowl={postersByBowl}
          services={streamingServices}
          streamingMode={streamingMode}
          topService={drawingService}
          isStreamingOverridden={
            Object.prototype.hasOwnProperty.call(overriddenSettings, "prioritizeStreaming") ||
            Object.prototype.hasOwnProperty.call(overriddenSettings, "useStreamingRank")
          }
          onToggleBowl={(bowlId) =>
            setScopeOverride((previous) => {
              const current = previous ?? bowlIds;
              return current.includes(bowlId)
                ? current.filter((id) => id !== bowlId)
                : [...current, bowlId];
            })
          }
          onSelectAllBowls={() => setScopeOverride(bowlIds)}
          onChangeStreamingMode={(mode) => setTvSettings(getStreamingModeSettings(mode))}
          onClose={() => setShowScopeSheet(false)}
        />
      )}

      {showDrawConfirm && (
        <div className="tv-dialog-backdrop" role="presentation">
          <section
            className="tv-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tv-solo-confirm-title"
          >
            <p className="tv-kicker">Just for you</p>
            <h2 id="tv-solo-confirm-title">Pick one of your movies?</h2>
            <p>
              The result goes straight to your Watch History. It does not remove
              anything from a shared bowl.
            </p>
            <div className="tv-dialog-actions">
              <button
                type="button"
                className="tv-button tv-button-quiet"
                data-tv-focusable
                data-tv-nav-group="solo-draw-dialog"
                onClick={() => setShowDrawConfirm(false)}
              >
                Not yet
              </button>
              <button
                type="button"
                className="tv-button tv-button-primary"
                data-tv-focusable
                data-tv-nav-group="solo-draw-dialog"
                data-tv-autofocus="true"
                onClick={performDraw}
              >
                Reveal one
              </button>
            </div>
          </section>
        </div>
      )}

      {canRetrySave && (
        <div className="tv-dialog-backdrop" role="presentation">
          <section
            className="tv-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tv-solo-save-title"
          >
            <p className="tv-kicker">Pick not revealed</p>
            <h2 id="tv-solo-save-title">Couldn&apos;t save this draw.</h2>
            <p>{drawErrorMessage}</p>
            <div className="tv-dialog-actions">
              <button
                type="button"
                className="tv-button tv-button-quiet"
                data-tv-focusable
                data-tv-nav-group="solo-save-dialog"
                onClick={clearError}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tv-button tv-button-primary"
                data-tv-focusable
                data-tv-nav-group="solo-save-dialog"
                data-tv-autofocus="true"
                onClick={retryPendingSave}
              >
                Retry saving
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
