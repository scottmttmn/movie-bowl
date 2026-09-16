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
import {
  buildSoloPreviewPool,
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

const SOLO_FILTER_METADATA_FETCHERS = {
  fetchMovieDetails: getTmdbMovieDetails,
  fetchProviders: fetchStreamingProviders,
  fetchFilterMetadata: fetchMovieFilterMetadata,
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

  const availableGenres = useMemo(
    () => getAvailableDrawGenres(rows),
    [rows]
  );
  const drawOptions = useMemo(
    () => buildTvDrawOptions(settings, streamingServices, availableGenres),
    [settings, streamingServices, availableGenres]
  );
  const {
    status: drawPoolStatus,
    poolCount,
  } = useDrawPoolCount(rows, drawOptions, SOLO_FILTER_METADATA_FETCHERS);
  const distinctTitleCount = useMemo(
    () => groupSoloCandidatesByTitle(rows).length,
    [rows]
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
      rows.length === 0
    ) {
      return;
    }

    const drawPool = [...rows];
    const options = { ...drawOptions };
    void revealCommittedDraw(() => draw(drawPool, options), drawPool, options);
  };

  const retryPendingSave = () => {
    if (!canRetrySave || isBusy) return;
    const drawPool = [...rows];
    const options = { ...drawOptions };
    void revealCommittedDraw(retrySave, drawPool, options);
  };

  useTvSpatialNavigation({
    scopeKey: [
      "solo",
      isPoolLoading,
      isPreferencesLoading,
      showDrawConfirm,
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
  const isBehindDialog = showDrawConfirm || canRetrySave;

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

            {!isPoolLoading && !poolErrorMessage && rows.length > 0 && !filteredOut && (
              <p className="tv-solo-pool-summary">
                <strong>{distinctTitleCount}</strong>{" "}
                {pluralize(distinctTitleCount, "title")} across{" "}
                <strong>{bowls.length}</strong> {pluralize(bowls.length, "bowl")}
              </p>
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
