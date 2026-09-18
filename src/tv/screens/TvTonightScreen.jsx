import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import BowlIllustration from "../../components/BowlIllustration";
import useBowl from "../../hooks/useBowl";
import useUserStreamingServices from "../../hooks/useUserStreamingServices";
import { getTmdbMovieDetails } from "../../lib/tmdbApi";
import { fetchMovieTrailer, resolveEligiblePreviewIds } from "../../lib/theaterPreviews";
import { getMovieAttributionLabel } from "../../utils/drawBuckets";
import { getDrawReadout } from "../../utils/drawReadout";
import { clampTheaterTrailerCount } from "../../utils/drawSettings";
import { getPosterUrl } from "../../utils/getPosterUrl";

import useDrawPoolCount, { DRAW_POOL_STATUS } from "../../hooks/useDrawPoolCount";
import {
  STREAMING_MATCH_STATUS,
  STREAMING_MATCH_TONE,
} from "../../utils/streamingMatchSummary";
import {
  getAutoStartMode,
  getAutoStartSurface,
  resolvePreferredLaunchTarget,
} from "../../utils/webLaunch";
import { canReturnDrawToBowl } from "../../utils/watchHistory";
import useDrawProviderLinks from "../../hooks/useDrawProviderLinks";
import TvBrand from "../components/TvBrand";
import {
  TvDrawingScreen,
  TvMovieDetailStage,
  TvRevealScreen,
} from "../components/TvDrawExperience";
import TvStreamingRail from "../components/TvStreamingRail";
import TvDrawMethodMark from "../components/TvDrawMethodMark";
import TvTheaterTicket from "../components/TvTheaterTicket";
import { getStreamingMode, getStreamingModeSettings } from "../utils/streamingMode";
import TvTheaterPreroll from "../components/TvTheaterPreroll";
import TvFullscreenTrailer from "../components/TvFullscreenTrailer";
import { useTvBowlAccess } from "../hooks/useTvBowls";
import useDeviceDrawSettings from "../../hooks/useDeviceDrawSettings";
import useTvSpatialNavigation from "../hooks/useTvSpatialNavigation";
import {
  buildTrailerQueue,
  readRecentTrailerKeys,
  rememberTrailerKeys,
} from "../../utils/theaterQueue";
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

// Avoid leaving the result screen in a permanent loading state if preview
// enrichment stalls. The Android wrapper explicitly permits media autoplay.
const MAX_PREVIEW_WAIT_MS = 2500;

const TV_PICKED_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatPickedDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return TV_PICKED_DATE_FORMATTER.format(date);
}

function mergeHistoryMovieDetails(movie, details) {
  return {
    ...(details || {}),
    ...movie,
    id: movie.id,
    tmdb_id: movie.tmdb_id,
    poster_path: movie.poster_path || details?.poster_path || null,
    release_date: movie.release_date || details?.release_date || null,
    runtime: movie.runtime ?? details?.runtime ?? null,
    genres:
      Array.isArray(movie.genres) && movie.genres.length > 0
        ? movie.genres
        : details?.genres || [],
    overview: movie.overview || details?.overview || null,
    trailer: details?.trailer || movie.trailer || null,
  };
}

// Watch History details carry no availability, so this is the trailer and the
// facts around it — never a provider lookup for a movie already watched.
async function enrichHistoryMovie(movie) {
  const tmdbId = Number(movie?.tmdb_id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return movie;

  let details = null;
  try {
    details = await getTmdbMovieDetails(tmdbId);
  } catch (error) {
    console.error("[TvTonightScreen] Failed to enrich Watch History details", error);
  }

  return mergeHistoryMovieDetails(movie, details);
}

async function enrichDrawnMovie(movie) {
  const tmdbId = Number(movie?.tmdb_id ?? movie?.id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return movie;

  try {
    const details = await getTmdbMovieDetails(tmdbId);
    return {
      ...movie,
      ...(details || {}),
      id: movie.id,
      tmdb_id: movie.tmdb_id,
      streamingProviders: movie.streamingProviders || [],
      streamingProviderLogos: movie.streamingProviderLogos || {},
      streamingAvailability: movie.streamingAvailability || {},
      streamingWatchUrl: movie.streamingWatchUrl || null,
      streamingProviderStatus: movie.streamingProviderStatus || "ready",
      streamingRegion: movie.streamingRegion || "US",
    };
  } catch (error) {
    console.error("[TvTonightScreen] Failed to enrich drawn movie", error);
    return movie;
  }
}

function TvTonightHeader({ onBack, onResetSettings }) {
  return (
    <header className="tv-topbar" data-tv-nav-region="header">
      <TvBrand />
      <div className="tv-topbar-actions">
        {/* Only once this television has an opinion to drop. In the settings
            row it out-shouted the toggle beside it; up here it sits with the
            other thing you do to the whole screen rather than set on it. */}
        {onResetSettings && (
          <button
            type="button"
            className="tv-text-button tv-text-button-strong"
            data-tv-focusable
            data-tv-nav-group="tonight-header"
            onClick={onResetSettings}
          >
            Use my phone&apos;s settings
          </button>
        )}
        <button
          type="button"
          className="tv-text-button"
          data-tv-focusable
          data-tv-nav-group="tonight-header"
          onClick={onBack}
        >
          ← Change bowl
        </button>
      </div>
    </header>
  );
}

function TvLoadingScreen({ message }) {
  return (
    <main className="tv-center-state" role="status">
      <span className="tv-loading-dot" aria-hidden="true" />
      <p>{message}</p>
    </main>
  );
}

function TvErrorScreen({ message, onBack }) {
  return (
    <main className="tv-center-state" role="alert">
      <p className="tv-kicker">We hit a snag</p>
      <h1>This bowl couldn&apos;t be opened.</h1>
      <p>{message}</p>
      <button
        type="button"
        className="tv-button tv-button-primary"
        data-tv-focusable
        data-tv-autofocus="true"
        onClick={onBack}
      >
        Choose another bowl
      </button>
    </main>
  );
}

// The phone's stat line, in the one place a television can put it: under the
// button it describes. Static text, because a D-pad landing on a control that
// opens nothing is worse than a mouse doing it.
function TvDrawReadout({ readout, isApproximate, contributorReach, excludedContributorCount }) {
  if (readout.count === 0) {
    return (
      <p className="tv-draw-readout" data-tone={STREAMING_MATCH_TONE.warning}>
        Nothing to draw
      </p>
    );
  }

  return (
    <p className="tv-draw-readout" data-tone={readout.tone}>
      <span>
        Drawing from {isApproximate ? "up to " : ""}
        <strong>{readout.count}</strong>
        {readout.service ? ` on ${readout.service}` : ""}
      </span>
      {excludedContributorCount > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <span className="tv-draw-readout-reach">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="8" r="3.2" />
              <path d="M3 20c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4Z" />
              <circle cx="17.5" cy="9" r="2.6" />
              <path d="M15.4 14.9c2.9-.5 5.6 1.2 5.6 4.1v1h-4.6c0-1.9-.4-3.6-1-5.1Z" />
            </svg>
            <span aria-hidden="true">
              <strong>{contributorReach.reachedCount}</strong>/{contributorReach.totalCount}
            </span>
            <span className="sr-only">
              {`Only ${contributorReach.reachedCount} of ${contributorReach.totalCount} people have a movie in the draw.`}
            </span>
          </span>
        </>
      )}
    </p>
  );
}

function TvRecentDraws({ movies, restoreFocusId, onFocusRestored, onSelect }) {
  const recentMovies = movies || [];
  if (recentMovies.length === 0) return null;

  return (
    <section
      className="tv-recent-section"
      aria-labelledby="tv-recent-title"
      data-tv-nav-region="history"
    >
      <div>
        <p className="tv-kicker">From this bowl</p>
        <h2 id="tv-recent-title">Watch History</h2>
      </div>
      <div className="tv-recent-list">
        {recentMovies.map((movie) => {
          const focusId = movie.drawEventId || movie.id;
          const shouldRestoreFocus = String(focusId) === String(restoreFocusId);

          return (
            <button
              type="button"
              className="tv-recent-movie"
              key={focusId}
              data-tv-focusable
              data-tv-nav-group="watch-history"
              data-tv-autofocus={shouldRestoreFocus ? "true" : undefined}
              aria-label={`View details for ${movie.title} in Watch History`}
              onFocus={() => {
                if (shouldRestoreFocus) onFocusRestored?.();
              }}
              onClick={() => onSelect(movie)}
            >
              <img src={getPosterUrl(movie, "w185")} alt="" />
              <span>
                <strong>{movie.title}</strong>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TvHistoryDetailScreen({
  bowlName,
  movie,
  canReturn,
  returnWindowClosed,
  isEnriching,
  showTrailer,
  isDialogOpen,
  onClose,
  onCloseTrailer,
  onToggleTrailer,
  onRequestReturn,
}) {
  const trailer = movie.trailer;
  const pickedDate = formatPickedDate(movie.drawn_at || movie.drawnAt);
  const addedBy = getMovieAttributionLabel(movie);
  const historyMetadata = [
    pickedDate ? `Picked ${pickedDate}` : null,
    addedBy ? `Added by ${addedBy}` : null,
  ].filter(Boolean);
  const isCoveredByOverlay = isDialogOpen || showTrailer;

  return (
    <>
      <main
        className="tv-page tv-reveal-page tv-history-detail-page"
        aria-hidden={isCoveredByOverlay ? "true" : undefined}
        inert={isCoveredByOverlay}
      >
        <header className="tv-topbar">
          <TvBrand context="Watch History" />
          <div className="tv-history-detail-header-actions">
            <div className="tv-reveal-bowl-name">{bowlName}</div>
            <button
              type="button"
              className="tv-text-button"
              data-tv-focusable
              data-tv-nav-group="history-header"
              data-tv-autofocus="true"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </header>

        <TvMovieDetailStage
          movie={movie}
          showWhereToWatch={false}
          kicker="Previously picked"
          historyMetadata={historyMetadata}
          onToggleTrailer={onToggleTrailer}
          playbackAutofocus={false}
        >
          {isEnriching && (
            <p className="tv-preview-status" role="status">
              Loading trailer…
            </p>
          )}
          {!canReturn && returnWindowClosed && (
            <p className="tv-history-return-closed">
              Putting a pick back is available for two hours after the draw. Add the
              movie again from your phone to watch it another night.
            </p>
          )}
          {canReturn && (
            <div className="tv-history-return-action">
              <div>
                <strong>Didn&apos;t watch it?</strong>
                <span>
                  Putting it back removes this pick from everyone&apos;s Watch History.
                </span>
              </div>
              <button
                type="button"
                className="tv-button tv-button-quiet"
                data-tv-focusable
                data-tv-nav-group="history-return"
                onClick={onRequestReturn}
              >
                Put movie back in bowl
              </button>
            </div>
          )}
        </TvMovieDetailStage>

      </main>

      {showTrailer && trailer?.embedUrl && (
        <TvFullscreenTrailer
          movieTitle={movie.title}
          trailer={trailer}
          onClose={onCloseTrailer}
        />
      )}
    </>
  );
}

function TvReturnDialog({
  request,
  isReturning,
  errorMessage,
  onCancel,
  onConfirm,
}) {
  if (!request) return null;

  const title = request.movie?.title || "this movie";

  return (
    <div className="tv-dialog-backdrop" role="presentation">
      <section
        className="tv-dialog tv-return-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tv-return-title"
      >
        <p className="tv-kicker">Watch History</p>
        <h2 id="tv-return-title">Put “{title}” back in the bowl?</h2>
        <p>
          Putting it back removes the Watch History entries this pick created, for
          everyone.
        </p>
        {errorMessage && (
          <p className="tv-dialog-error" role="alert">
            {errorMessage}
          </p>
        )}
        <div className="tv-dialog-actions">
          <button
            type="button"
            className="tv-button tv-button-primary"
            data-tv-focusable
            data-tv-nav-group="return-dialog"
            data-tv-autofocus="true"
            onClick={onCancel}
          >
            Close
          </button>
          <button
            type="button"
            className="tv-button tv-button-quiet"
            data-tv-focusable
            data-tv-nav-group="return-dialog"
            disabled={isReturning}
            onClick={onConfirm}
          >
            {isReturning ? "Putting movie back…" : "Put movie back in bowl"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function TvTonightScreen({ userId }) {
  const { bowlId } = useParams();
  const navigate = useNavigate();
  const { bowlMeta, isLoading: isAccessLoading, errorMessage: accessError } =
    useTvBowlAccess(bowlId, userId);
  const {
    bowl,
    isLoading: isBowlLoading,
    errorMessage: bowlError,
    handleDraw,
    handleReaddMovie,
    filterMetadataFetchers,
  } = useBowl(bowlId, { drawMethod: bowlMeta.drawMethod });
  const {
    streamingServices,
    defaultDrawSettings: accountDrawSettings,
    loading: isPreferencesLoading,
  } = useUserStreamingServices();
  // Everything below reads the merged view, so a television's overrides reach
  // the draw, the readout, and the pre-roll without any of them knowing that
  // some of it came from this room rather than from the account.
  const {
    settings: defaultDrawSettings,
    overriddenSettings,
    hasOverrides,
    isPersisted: areTvSettingsPersisted,
    setOverride: setTvSetting,
    setOverrides: setTvSettings,
    clearOverrides: clearTvSettings,
  } = useDeviceDrawSettings(userId, accountDrawSettings);

  const isTvOverridden = (name) =>
    Object.prototype.hasOwnProperty.call(overriddenSettings, name);
  const streamingMode = getStreamingMode(defaultDrawSettings);

  const [showDrawConfirm, setShowDrawConfirm] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawAnimationTitle, setDrawAnimationTitle] = useState("");
  const [drawnMovie, setDrawnMovie] = useState(() => readExternalReturn(bowlId));
  const [selectedHistoryMovie, setSelectedHistoryMovie] = useState(null);
  const [historyFocusId, setHistoryFocusId] = useState(null);
  const [isHistoryEnriching, setIsHistoryEnriching] = useState(false);
  // Only the drawn movie asks where to watch, so only the drawn movie spends a
  // provider-link lookup.
  const { providerLinks, startLookup: startProviderLookup } = useDrawProviderLinks(
    bowlId,
    drawnMovie
  );
  const [showTrailer, setShowTrailer] = useState(false);
  const [pendingReturn, setPendingReturn] = useState(null);
  const [isReturningMovie, setIsReturningMovie] = useState(false);
  const [returnErrorMessage, setReturnErrorMessage] = useState(null);
  const watchHistoryMovies = useMemo(() => bowl.watched ?? [], [bowl.watched]);
  const [tonightMessage, setTonightMessage] = useState(null);
  const [trailerQueue, setTrailerQueue] = useState([]);
  const [trailerQueueStatus, setTrailerQueueStatus] = useState("idle");
  const [isTheaterPending, setIsTheaterPending] = useState(false);
  const [isTheaterPlaying, setIsTheaterPlaying] = useState(false);
  const [providerLaunchMessage, setProviderLaunchMessage] = useState(null);
  const drawInFlightRef = useRef(false);
  const historyLoadSequenceRef = useRef(0);

  const isTheaterModeEnabled = Boolean(defaultDrawSettings?.theaterModeEnabled);
  const theaterTrailerCount = clampTheaterTrailerCount(
    defaultDrawSettings?.theaterTrailerCount
  );

  const availableGenres = useMemo(
    () => getAvailableDrawGenres(bowl.remaining),
    [bowl.remaining]
  );
  const drawOptions = useMemo(
    () => buildTvDrawOptions(defaultDrawSettings, streamingServices, availableGenres),
    [defaultDrawSettings, streamingServices, availableGenres]
  );
  // Held in refs rather than the preview effect's deps, the same trade-off
  // useDrawPoolCount makes: the pre-roll describes the draw that just ran, so a
  // fetcher identity settling underneath it must not rebuild the queue.
  const drawOptionsRef = useRef(drawOptions);
  drawOptionsRef.current = drawOptions;
  const filterMetadataFetchersRef = useRef(filterMetadataFetchers);
  filterMetadataFetchersRef.current = filterMetadataFetchers;
  // The phone answers a large uncached bowl with a tap; a television has no
  // such tap to offer, so it resolves the count itself. The draw is about to
  // spend the same metadata requests moments later, so this brings the cost
  // forward rather than adding one.
  const drawPoolOptions = useMemo(
    () => ({ ...filterMetadataFetchers, autoRunLookups: true }),
    [filterMetadataFetchers]
  );
  const {
    status: drawPoolStatus,
    poolCount: drawPoolCount,
    totalCount: drawPoolTotalCount,
    contributorReach: drawPoolContributorReach,
    streamingMatch: drawPoolStreamingMatch,
  } = useDrawPoolCount(bowl.remaining, drawOptions, drawPoolOptions);
  const isStreamingPrioritized =
    Boolean(drawOptions.prioritizeByServices) && streamingServices.length > 0;
  const hasResolvedPrioritizedPool =
    isStreamingPrioritized &&
    drawPoolTotalCount > 0 &&
    (drawPoolStatus === DRAW_POOL_STATUS.ready ||
      drawPoolStatus === DRAW_POOL_STATUS.unfiltered);
  const excludedContributorCount = drawPoolContributorReach
    ? drawPoolContributorReach.totalCount - drawPoolContributorReach.reachedCount
    : 0;
  const drawReadout = useMemo(
    () =>
      getDrawReadout({
        isFiltered: drawPoolStatus === DRAW_POOL_STATUS.ready,
        poolCount: drawPoolCount,
        poolTotalCount: drawPoolTotalCount,
        streamingStatus: hasResolvedPrioritizedPool
          ? STREAMING_MATCH_STATUS.ready
          : STREAMING_MATCH_STATUS.unavailable,
        streamingMatchCount: hasResolvedPrioritizedPool
          ? drawPoolStreamingMatch.matchCount
          : 0,
        streamingTopService: hasResolvedPrioritizedPool
          ? drawPoolStreamingMatch.topService
          : null,
        streamingTopServiceCount: hasResolvedPrioritizedPool
          ? drawPoolStreamingMatch.topServiceCount
          : 0,
        isPrioritized: isStreamingPrioritized,
        useServiceRank: Boolean(defaultDrawSettings?.useStreamingRank),
        hasExcludedContributors: excludedContributorCount > 0,
      }),
    [
      drawPoolStatus,
      drawPoolCount,
      drawPoolTotalCount,
      drawPoolStreamingMatch,
      hasResolvedPrioritizedPool,
      isStreamingPrioritized,
      defaultDrawSettings,
      excludedContributorCount,
    ]
  );
  // The television resolves its own count, so this is the brief state while
  // that runs, plus the one that outlives a failed scan. "up to" is the honest
  // version of both rather than a count the filters have not touched.
  const isDrawReadoutApproximate =
    drawPoolStatus !== DRAW_POOL_STATUS.ready &&
    drawPoolStatus !== DRAW_POOL_STATUS.unfiltered;
  const preferredWebLaunchCandidate = useMemo(() => {
    if (!drawnMovie) return null;

    return resolvePreferredLaunchTarget({
      providerLinks,
      userServices: streamingServices,
      movieProviders: drawnMovie.streamingProviders || [],
      title: drawnMovie.title || "",
    });
  }, [drawnMovie, streamingServices, providerLinks]);

  const chooseAnotherBowl = () => {
    clearExternalReturn();
    navigate("/tv/bowls");
  };

  const closeHistoryDetails = useCallback(() => {
    historyLoadSequenceRef.current += 1;
    setSelectedHistoryMovie(null);
    setIsHistoryEnriching(false);
    setShowTrailer(false);
    setProviderLaunchMessage(null);
  }, []);

  const openHistoryDetails = useCallback(
    (movie) => {
      if (!movie) return;

      const sequence = historyLoadSequenceRef.current + 1;
      historyLoadSequenceRef.current = sequence;
      setHistoryFocusId(movie.drawEventId || movie.id);
      setSelectedHistoryMovie(movie);
      setPendingReturn(null);
      setReturnErrorMessage(null);
      setShowTrailer(false);
      setProviderLaunchMessage(null);
      setIsHistoryEnriching(true);

      enrichHistoryMovie(movie)
        .then((enrichedMovie) => {
          if (historyLoadSequenceRef.current === sequence) {
            setSelectedHistoryMovie(enrichedMovie);
          }
        })
        .finally(() => {
          if (historyLoadSequenceRef.current === sequence) {
            setIsHistoryEnriching(false);
          }
        });
    },
    []
  );

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

  useEffect(() => {
    if (!selectedHistoryMovie || isReturningMovie) return;

    const selectedDrawEventId =
      selectedHistoryMovie.drawEventId || selectedHistoryMovie.id;
    const stillInHistory = watchHistoryMovies.some(
      (movie) => String(movie.drawEventId || movie.id) === String(selectedDrawEventId)
    );
    if (stillInHistory) return;

    const title = selectedHistoryMovie.title || "That movie";
    historyLoadSequenceRef.current += 1;
    setSelectedHistoryMovie(null);
    setPendingReturn(null);
    setHistoryFocusId(null);
    setIsHistoryEnriching(false);
    setShowTrailer(false);
    setTonightMessage(`${title} is no longer in Watch History.`);
  }, [watchHistoryMovies, selectedHistoryMovie, isReturningMovie]);

  // Resolve previews as soon as the draw is committed. Theater mode starts the
  // queue automatically; ordinary draws remain on the result screen.
  useEffect(() => {
    if (!isTheaterModeEnabled || !drawnMovie) {
      setTrailerQueue([]);
      setTrailerQueueStatus("idle");
      return undefined;
    }

    let cancelled = false;
    setTrailerQueue([]);
    setTrailerQueueStatus("loading");

    resolveEligiblePreviewIds({
      movies: bowl.remaining,
      drawOptions: drawOptionsRef.current,
      fetchers: filterMetadataFetchersRef.current,
    })
      .then((eligibleMovieIds) =>
        buildTrailerQueue({
          movies: bowl.remaining,
          eligibleMovieIds,
          excludeMovieId: drawnMovie.id,
          count: theaterTrailerCount,
          recentKeys: readRecentTrailerKeys(),
          fetchTrailer: fetchMovieTrailer,
        })
      )
      .then((queue) => {
        if (!cancelled) setTrailerQueue(queue);
      })
      .catch((error) => {
        console.error("[TvTonightScreen] Failed to build the preview queue", error);
        if (!cancelled) setTrailerQueue([]);
      })
      .finally(() => {
        if (!cancelled) setTrailerQueueStatus("ready");
      });

    return () => {
      cancelled = true;
    };
  }, [isTheaterModeEnabled, drawnMovie, bowl.remaining, theaterTrailerCount]);

  useEffect(() => {
    if (!isTheaterPending) return undefined;

    if (trailerQueueStatus === "ready") {
      setIsTheaterPending(false);
      if (trailerQueue.length > 0) setIsTheaterPlaying(true);
      return undefined;
    }

    const timer = window.setTimeout(
      () => setIsTheaterPending(false),
      MAX_PREVIEW_WAIT_MS
    );
    return () => window.clearTimeout(timer);
  }, [isTheaterPending, trailerQueueStatus, trailerQueue]);

  // The whole queue is recorded as played, including on an early exit: a few
  // previews suppressed for one extra movie night beats replaying them.
  const endTheater = useCallback(() => {
    setIsTheaterPlaying(false);
    rememberTrailerKeys(trailerQueue.map((item) => item.trailer?.key));
  }, [trailerQueue]);

  const beginProviderLaunch = useCallback(() => {
    setProviderLaunchMessage(null);
    rememberExternalReturn({ bowlId, movie: drawnMovie });
  }, [bowlId, drawnMovie]);

  // Only the Google TV app auto-starts from this route: its shell hands a new
  // window to the provider app and keeps Movie Bowl behind it. A laptop on /tv
  // is not the room this was built for, and keeps the button.
  const autoStartCandidate =
    getAutoStartMode({
      surface: getAutoStartSurface({ userAgent: window.navigator?.userAgent }),
      launchCandidate: preferredWebLaunchCandidate,
      launchError: providerLaunchMessage,
    }) === "window"
      ? preferredWebLaunchCandidate
      : null;

  // The feature card ran its course. Previews only play after a fresh draw,
  // never on a reveal restored from a provider handoff, so coming back from
  // the app cannot send the room straight back into it.
  const completeTheater = useCallback(() => {
    endTheater();
    if (!autoStartCandidate) return;
    beginProviderLaunch();
    window.open(autoStartCandidate.url, "_blank", "noopener,noreferrer");
  }, [endTheater, autoStartCandidate, beginProviderLaunch]);

  useTvSpatialNavigation({
    scopeKey: [
      "tonight",
      bowlId,
      isAccessLoading,
      isBowlLoading,
      showDrawConfirm,
      isDrawing,
      drawnMovie?.id || "",
      selectedHistoryMovie?.drawEventId || selectedHistoryMovie?.id || "",
      showTrailer,
      isTheaterPlaying,
      pendingReturn?.drawEventId || "",
      Boolean(accessError),
      // A failed launch disables the focused button, so focus has to move on.
      Boolean(providerLaunchMessage),
    ].join(":"),
    onBack: () => {
      if (isDrawing) return;
      if (isTheaterPlaying) {
        endTheater();
        return;
      }
      if (pendingReturn) {
        setPendingReturn(null);
        setReturnErrorMessage(null);
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
      if (selectedHistoryMovie) {
        closeHistoryDetails();
        return;
      }
      if (drawnMovie) {
        clearExternalReturn();
        setDrawnMovie(null);
        setIsTheaterPending(false);
        setIsTheaterPlaying(false);
        setShowTrailer(false);
        return;
      }
      chooseAnotherBowl();
    },
  });

  const performDraw = async () => {
    if (
      drawInFlightRef.current ||
      isDrawing ||
      !bowlMeta.canDraw ||
      bowl.remaining.length === 0 ||
      isPreferencesLoading
    ) {
      return;
    }

    drawInFlightRef.current = true;
    clearExternalReturn();
    setShowDrawConfirm(false);
    setTonightMessage(null);
    setDrawAnimationTitle("");
    setIsDrawing(true);

    try {
      const delay = new Promise((resolve) =>
        window.setTimeout(resolve, MIN_DRAW_ANIMATION_MS)
      );
      const drawPromise = handleDraw(drawOptions).then((movie) => {
        startProviderLookup(movie);
        if (movie?.title) setDrawAnimationTitle(movie.title);
        return movie;
      });

      const [movie] = await Promise.all([drawPromise, delay]);
      if (!movie) return;

      const detailedMovie = await enrichDrawnMovie(movie);
      setDrawnMovie(detailedMovie);
      setIsTheaterPending(isTheaterModeEnabled);
      setIsTheaterPlaying(false);
      setShowTrailer(false);
      setProviderLaunchMessage(null);
    } finally {
      drawInFlightRef.current = false;
      setIsDrawing(false);
      setDrawAnimationTitle("");
    }
  };

  const requestReturnFromHistory = (movie) => {
    if (!movie) return;

    setReturnErrorMessage(null);
    setPendingReturn({
      movie,
      drawEventId: movie.drawEventId || movie.id,
    });
  };

  const confirmReturnToBowl = async () => {
    if (!pendingReturn || isReturningMovie) return;

    setIsReturningMovie(true);
    setReturnErrorMessage(null);

    try {
      const result = await handleReaddMovie(pendingReturn.drawEventId);
      if (!result?.ok) {
        setReturnErrorMessage(
          result?.message || "This movie could not be returned to the bowl."
        );
        return;
      }

      const returnedTitle = pendingReturn.movie?.title || "Movie";
      clearExternalReturn();
      historyLoadSequenceRef.current += 1;
      setPendingReturn(null);
      setSelectedHistoryMovie(null);
      setHistoryFocusId(null);
      setIsHistoryEnriching(false);
      setDrawnMovie(null);
      setIsTheaterPending(false);
      setIsTheaterPlaying(false);
      setShowTrailer(false);
      setShowDrawConfirm(false);
      setTonightMessage(`${returnedTitle} is back in the bowl.`);
    } finally {
      setIsReturningMovie(false);
    }
  };

  const closeReturnDialog = () => {
    setPendingReturn(null);
    setReturnErrorMessage(null);
  };

  if (isAccessLoading || (isBowlLoading && !isDrawing)) {
    return <TvLoadingScreen message="Getting tonight’s bowl ready…" />;
  }

  if (accessError) {
    return <TvErrorScreen message={accessError} onBack={chooseAnotherBowl} />;
  }

  if (isDrawing) {
    return (
      <TvDrawingScreen
        bowlName={bowlMeta.name}
        drawTitle={drawAnimationTitle}
        poolCount={drawPoolCount}
        totalCount={drawPoolTotalCount}
        contributorReach={drawPoolContributorReach}
      />
    );
  }

  if (drawnMovie) {
    return (
      <>
        <TvRevealScreen
          bowlName={bowlMeta.name}
          movie={drawnMovie}
          streamingServices={streamingServices}
          isPreparingPreviews={isTheaterPending}
          showTrailer={showTrailer}
          isDialogOpen={Boolean(pendingReturn) || isTheaterPlaying}
          webLaunchCandidate={preferredWebLaunchCandidate}
          providerLaunchMessage={providerLaunchMessage}
          onProviderLaunch={beginProviderLaunch}
          onCloseTrailer={() => setShowTrailer(false)}
          onToggleTrailer={() => setShowTrailer((current) => !current)}
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

  if (selectedHistoryMovie) {
    return (
      <>
        <TvHistoryDetailScreen
          bowlName={bowlMeta.name}
          movie={selectedHistoryMovie}
          canReturn={bowlMeta.canDraw && canReturnDrawToBowl(selectedHistoryMovie)}
          returnWindowClosed={
            bowlMeta.canDraw && !canReturnDrawToBowl(selectedHistoryMovie)
          }
          isEnriching={isHistoryEnriching}
          showTrailer={showTrailer}
          isDialogOpen={Boolean(pendingReturn)}
          onClose={closeHistoryDetails}
          onCloseTrailer={() => setShowTrailer(false)}
          onToggleTrailer={() => setShowTrailer((current) => !current)}
          onRequestReturn={() => requestReturnFromHistory(selectedHistoryMovie)}
        />
        <TvReturnDialog
          request={pendingReturn}
          isReturning={isReturningMovie}
          errorMessage={returnErrorMessage}
          onCancel={closeReturnDialog}
          onConfirm={confirmReturnToBowl}
        />
      </>
    );
  }

  const remainingCount = bowl.remaining.length;
  const drawDisabled =
    remainingCount === 0 ||
    !bowlMeta.canDraw ||
    isPreferencesLoading;

  // Same reason as the reveal: aria-hidden keeps this out of our navigation,
  // but only inert keeps it out of the WebView's own D-pad traversal.
  const isBehindDialog = Boolean(showDrawConfirm || pendingReturn);

  return (
    <main className="tv-page tv-tonight-page">
      <div
        aria-hidden={isBehindDialog ? "true" : undefined}
        inert={isBehindDialog}
      >
        <TvTonightHeader
          onBack={chooseAnotherBowl}
          onResetSettings={hasOverrides ? clearTvSettings : null}
        />

        <section className="tv-tonight-grid">
          <div
            className="tv-tonight-stage"
            data-tv-nav-region="stage"
            data-theater={defaultDrawSettings.theaterModeEnabled ? "true" : undefined}
          >
            {/* The method belongs to the bowl rather than to tonight, so it
                sits with the bowl's name and not in the readout, which is
                about this draw's pool. */}
            <div className="tv-tonight-heading">
              <h1 className="tv-tonight-title">{bowlMeta.name}</h1>
              <TvDrawMethodMark drawMethod={bowlMeta.drawMethod} />
            </div>

            <div className="tv-tonight-mid">
              <div className="tv-tonight-left">
              <div className="tv-draw-cta">
              {/* The bowl is the control. Left beside the button it was an
                  ornament holding the best space on the screen and giving
                  nothing back; inside it, the largest thing here and the only
                  thing to do are the same object. */}
              <button
                type="button"
                className="tv-draw-button"
                data-tv-focusable
                data-tv-nav-group="primary-draw"
                data-tv-autofocus={!historyFocusId ? "true" : undefined}
                disabled={drawDisabled}
                onClick={() => {
                  setTonightMessage(null);
                  setShowDrawConfirm(true);
                }}
              >
                <BowlIllustration className="tv-draw-bowl" />
                <span>Draw a movie</span>
              </button>
              {remainingCount > 0 && (
                <TvDrawReadout
                  readout={drawReadout}
                  isApproximate={isDrawReadoutApproximate}
                  contributorReach={drawPoolContributorReach}
                  excludedContributorCount={excludedContributorCount}
                />
              )}
              {!bowlMeta.canDraw && (
                <p className="tv-draw-guard">
                  This user does not have permission to draw from this bowl.
                </p>
              )}
              {remainingCount === 0 && (
                <p className="tv-draw-guard">
                  Add some movies from a phone before starting the draw.
                </p>
              )}
              {bowlError && (
                <p className="tv-draw-guard tv-draw-error" role="alert">
                  {bowlError}
                </p>
              )}
              {tonightMessage && (
                <p className="tv-tonight-message" role="status">
                  {tonightMessage}
                </p>
              )}
                {!isPreferencesLoading && (
                  <TvTheaterTicket
                    enabled={Boolean(defaultDrawSettings.theaterModeEnabled)}
                    isOverridden={isTvOverridden("theaterModeEnabled")}
                    onToggle={setTvSetting}
                  />
                )}
              </div>

              {/* A write this television refused. The settings still apply for
                  tonight, so this warns rather than reverts -- and it sits in
                  the column it describes, sharing a centre line with the
                  controls stacked above it. Centred on the stage instead it
                  reads as off-axis, because the rail makes the stage
                  asymmetric. */}
              {!areTvSettingsPersisted && (
                <p className="tv-stage-warning" role="status">
                  This TV can&apos;t remember settings, so these last until it restarts.
                </p>
              )}
              </div>

              {!isPreferencesLoading && (
                <TvStreamingRail
                  services={streamingServices}
                  mode={streamingMode}
                  topService={drawReadout.service}
                  isOverridden={
                    isTvOverridden("prioritizeStreaming") ||
                    isTvOverridden("useStreamingRank")
                  }
                  onChange={(mode) => setTvSettings(getStreamingModeSettings(mode))}
                />
              )}
            </div>
          </div>
        </section>

        <TvRecentDraws
          movies={watchHistoryMovies}
          restoreFocusId={historyFocusId}
          onFocusRestored={() => setHistoryFocusId(null)}
          onSelect={openHistoryDetails}
        />

      </div>

      {showDrawConfirm && (
        <div className="tv-dialog-backdrop" role="presentation">
          <section
            className="tv-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tv-confirm-title"
          >
            <p className="tv-kicker">The room is ready</p>
            <h2 id="tv-confirm-title">Reveal one movie?</h2>
            <p>
              The result will be recorded in this bowl&apos;s Watch History.
            </p>
            <div className="tv-dialog-actions">
              <button
                type="button"
                className="tv-button tv-button-quiet"
                data-tv-focusable
                data-tv-nav-group="draw-dialog"
                onClick={() => setShowDrawConfirm(false)}
              >
                Not yet
              </button>
              <button
                type="button"
                className="tv-button tv-button-primary"
                data-tv-focusable
                data-tv-nav-group="draw-dialog"
                data-tv-autofocus="true"
                onClick={performDraw}
              >
                Reveal a movie
              </button>
            </div>
          </section>
        </div>
      )}

      <TvReturnDialog
        request={pendingReturn}
        isReturning={isReturningMovie}
        errorMessage={returnErrorMessage}
        onCancel={closeReturnDialog}
        onConfirm={confirmReturnToBowl}
      />
    </main>
  );
}
