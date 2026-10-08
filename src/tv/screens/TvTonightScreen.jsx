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
import useBowlLiveDraw from "../../hooks/useBowlLiveDraw";
import { buildLiveDraw, findAnnouncedDraw, verifyAnnouncedReveal } from "../../utils/liveDraw";
import { getTmdbMovieDetails } from "../../lib/tmdbApi";
import { fetchMovieTrailer, resolveEligiblePreviewIds } from "../../lib/theaterPreviews";
import { getDrawReadout } from "../../utils/drawReadout";
import { normalizeDrawMethod } from "../../utils/drawMethods";
import { getDrawRevealPreview, getDrawRevealTimeline } from "../../utils/drawReveal";
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
  resolveRentTarget,
} from "../../utils/webLaunch";
import { isTvAppRentalLink } from "../../utils/rentalStores";
import { canReturnDrawToBowl } from "../../utils/watchHistory";
import useDrawProviderLinks from "../../hooks/useDrawProviderLinks";
import TvBrand from "../components/TvBrand";
import {
  TvDrawingScreen,
  TvMovieDetailStage,
  TvRevealBackdrop,
  TvRevealScreen,
} from "../components/TvDrawExperience";
import TvStreamingRail from "../components/TvStreamingRail";
import DrawMethodMark from "../../components/DrawMethodMark";
import FilmStripGlyph from "../../components/FilmStripGlyph";
import PeopleGlyph from "../../components/PeopleGlyph";
import TvTheaterToggle from "../components/TvTheaterToggle";
import TheaterCurtains, { TheaterRevealCurtains } from "../../components/TheaterCurtains";
import { getStreamingMode, getStreamingModeSettings } from "../utils/streamingMode";
import TvTheaterPreroll from "../components/TvTheaterPreroll";
import TvFullscreenTrailer from "../components/TvFullscreenTrailer";
import { useTvBowlAccess } from "../hooks/useTvBowls";
import useDeviceDrawSettings from "../../hooks/useDeviceDrawSettings";
import useProviderLaunchError from "../hooks/useProviderLaunchError";
import useTvSpatialNavigation from "../hooks/useTvSpatialNavigation";
import {
  buildTrailerQueue,
  readRecentTrailers,
  rememberTrailers,
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
import {
  getRememberedValueFor,
  readRememberedReadout,
  rememberReadout,
} from "../../utils/rememberedReadouts";

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
function TvDrawReadout({ readout, isApproximate, contributorReach, excludedContributorCount, memberCount, drawMethod }) {
  if (readout.count === 0) {
    return (
      <p className="tv-draw-readout" data-tone={STREAMING_MATCH_TONE.warning}>
        Nothing to draw
      </p>
    );
  }

  // The bowl list's two marks: the film strip counts what the draw chooses
  // among, the people count the bowl's members -- until filters leave someone
  // out, when they turn into the ratio that should stop someone. The method's
  // slip closes the line, as it does under the phone's bowl.
  return (
    <p className="tv-draw-readout" data-tone={readout.tone}>
      <span className="tv-draw-readout-stat">
        <FilmStripGlyph className="tv-draw-readout-glyph" />
        <span className="sr-only">{isApproximate ? "Drawing from up to " : "Drawing from "}</span>
        {isApproximate ? <span aria-hidden="true">≤</span> : null}
        <strong>{readout.count}</strong>
        {/* A non-breaking space, because the flex row trims an ordinary one
            off the front of loose text and the count runs into the name. */}
        {readout.service ? `\u00a0on ${readout.service}` : ""}
      </span>
      {excludedContributorCount > 0 ? (
        <span className="tv-draw-readout-stat tv-draw-readout-reach">
          <PeopleGlyph className="tv-draw-readout-glyph" />
          <span aria-hidden="true">
            <strong>{contributorReach.reachedCount}</strong>/{contributorReach.totalCount}
          </span>
          <span className="sr-only">
            {`Only ${contributorReach.reachedCount} of ${contributorReach.totalCount} people have a movie in the draw.`}
          </span>
        </span>
      ) : memberCount ? (
        <span className="tv-draw-readout-stat tv-draw-readout-members">
          {/* Spoken as its own sentence, or a reader runs the two numbers
              together into one. */}
          <span className="sr-only">. </span>
          <PeopleGlyph className="tv-draw-readout-glyph" />
          <strong>{memberCount}</strong>
          <span className="sr-only">{memberCount === 1 ? " member" : " members"}</span>
        </span>
      ) : null}
      <span className="tv-draw-readout-stat">
        <DrawMethodMark drawMethod={drawMethod} className="tv-method-mark" />
      </span>
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
      <h2 id="tv-recent-title">Watched</h2>
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
  isEnriching,
  showTrailer,
  isDialogOpen,
  onCloseTrailer,
  onToggleTrailer,
  onRequestReturn,
}) {
  const trailer = movie.trailer;
  const isCoveredByOverlay = isDialogOpen || showTrailer;

  // The tonight sheet again, a night later: the slip still says why it was in
  // the bowl, and the date says when it came out. Where it was streaming is
  // left off, because nobody is choosing how to watch it any more.
  return (
    <>
      <main
        className="tv-page tv-reveal-page tv-history-detail-page"
        aria-hidden={isCoveredByOverlay ? "true" : undefined}
        inert={isCoveredByOverlay}
      >
        <TvRevealBackdrop movie={movie} />
        <header className="tv-topbar">
          <TvBrand />
          <div className="tv-reveal-bowl-name">{bowlName}</div>
        </header>

        <TvMovieDetailStage
          movie={movie}
          showWhereToWatch={false}
          onToggleTrailer={onToggleTrailer}
          tonight
          watchedOn={formatPickedDate(movie.drawn_at || movie.drawnAt)}
          extraActions={canReturn ? (
            // The trailer is where the remote starts. A title without one still
            // needs somewhere to land, and the confirm behind this button
            // starts on Not yet, so one stray press undoes nothing.
            <button
              type="button"
              className="tv-button tv-button-quiet"
              data-tv-focusable
              data-tv-nav-group="reveal-actions"
              onClick={onRequestReturn}
            >
              Move to Bowl
            </button>
          ) : null}
        >
          {isEnriching && (
            <p className="tv-preview-status" role="status">
              Loading trailer…
            </p>
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
        <BowlIllustration className="tv-dialog-bowl" />
        <h2 id="tv-return-title">Put {title} back?</h2>
        {/* The one consequence nothing on screen can show: it is undone for
            everyone, not just this room. */}
        <p>It comes off everyone&apos;s Watch History.</p>
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
            Not yet
          </button>
          <button
            type="button"
            className="tv-button tv-button-quiet"
            data-tv-focusable
            data-tv-nav-group="return-dialog"
            disabled={isReturning}
            onClick={onConfirm}
          >
            {isReturning ? "Moving…" : "Move to Bowl"}
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
    reload: reloadBowl,
    handleDraw,
    handleReaddMovie,
    filterMetadataFetchers,
  } = useBowl(bowlId, { drawMethod: bowlMeta.drawMethod });
  const {
    streamingServices,
    defaultDrawSettings: accountDrawSettings,
    loading: isPreferencesLoading,
    loadError: preferencesLoadError,
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
  // Where the curtains around the bowl stood when the draw began, so the
  // screen-wide pair can grow out of them.
  const [curtainOrigin, setCurtainOrigin] = useState(null);
  const [revealRun, setRevealRun] = useState(null);
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
  const theaterRef = useRef(null);
  const { launchError, clearLaunchError, noteLaunch } = useProviderLaunchError();
  const providerLaunchMessage = launchError?.message || null;
  const drawInFlightRef = useRef(false);
  const drawBowlRef = useRef(null);
  const revealRunRef = useRef(null);
  const historyLoadSequenceRef = useRef(0);

  useEffect(() => () => {
    // A committed draw may finish after this route goes away. Its animation
    // callbacks must not publish a result into a different bowl's screen.
    // An announced replay is only a replay, so it is taken down at once
    // rather than left on screen until its reload and enrichment settle.
    if (revealRunRef.current?.announced) {
      drawInFlightRef.current = false;
      setIsDrawing(false);
      setRevealRun(null);
    }
    revealRunRef.current = null;
  }, [bowlId]);

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
  // The screen appears once access and the movies are in, but the readout
  // still waits on the saved filters and the count this television runs
  // itself -- and showing those steps read "up to 5" and then "2 on Netflix".
  // Until both answer it shows what it settled on last time in this room, or
  // keeps its line. A count that failed is settled: "up to" is its answer.
  const isDrawReadoutPending =
    isPreferencesLoading || drawPoolStatus === DRAW_POOL_STATUS.counting;
  const drawReadoutViewKey = `tv:bowl:${bowlId}`;
  const settledDrawReadout = !isDrawReadoutPending && !isBowlLoading
    ? {
        readout: { count: drawReadout.count, service: drawReadout.service, tone: drawReadout.tone },
        isApproximate: isDrawReadoutApproximate,
        reach: excludedContributorCount > 0
          ? {
              reachedCount: drawPoolContributorReach.reachedCount,
              totalCount: drawPoolContributorReach.totalCount,
            }
          : null,
      }
    : null;
  const settledDrawReadoutKey = settledDrawReadout ? JSON.stringify(settledDrawReadout) : null;
  const [lastSettledDrawReadout, setLastSettledDrawReadout] = useState(null);
  if (
    settledDrawReadout &&
    (lastSettledDrawReadout?.viewKey !== drawReadoutViewKey ||
      lastSettledDrawReadout.key !== settledDrawReadoutKey)
  ) {
    setLastSettledDrawReadout({
      viewKey: drawReadoutViewKey,
      key: settledDrawReadoutKey,
      value: settledDrawReadout,
    });
  }
  const rememberedDrawReadoutEntry = useMemo(
    () => readRememberedReadout(drawReadoutViewKey),
    [drawReadoutViewKey]
  );
  const heldDrawReadout = lastSettledDrawReadout?.viewKey === drawReadoutViewKey
    ? lastSettledDrawReadout.value
    : getRememberedValueFor(rememberedDrawReadoutEntry, userId);
  useEffect(() => {
    if (!settledDrawReadoutKey || !userId) return;
    rememberReadout(drawReadoutViewKey, userId, JSON.parse(settledDrawReadoutKey));
  }, [drawReadoutViewKey, userId, settledDrawReadoutKey]);
  const shownDrawReadout = settledDrawReadout || heldDrawReadout;
  const preferredWebLaunchCandidate = useMemo(() => {
    if (!drawnMovie) return null;

    return resolvePreferredLaunchTarget({
      providerLinks,
      userServices: streamingServices,
      movieProviders: drawnMovie.streamingProviders || [],
      title: drawnMovie.title || "",
    });
  }, [drawnMovie, streamingServices, providerLinks]);
  // Until the account's services and "Rent from" choice have actually loaded,
  // the defaults would offer a paid rental to someone who streams the movie or
  // turned rentals off, so the TV offers none.
  const rentCandidate = useMemo(() => {
    if (!drawnMovie || isPreferencesLoading || preferencesLoadError) return null;

    return resolveRentTarget({
      providerLinks,
      rentFrom: accountDrawSettings?.rentFrom,
      userServices: streamingServices,
      movieProviders: drawnMovie.streamingProviders || [],
      availabilityStatus: drawnMovie.streamingProviderStatus,
      acceptLink: isTvAppRentalLink,
    });
  }, [
    drawnMovie,
    isPreferencesLoading,
    preferencesLoadError,
    providerLinks,
    streamingServices,
    accountDrawSettings?.rentFrom,
  ]);

  const chooseAnotherBowl = () => {
    clearExternalReturn();
    navigate("/tv/bowls");
  };

  const closeHistoryDetails = useCallback(() => {
    historyLoadSequenceRef.current += 1;
    setSelectedHistoryMovie(null);
    setIsHistoryEnriching(false);
    setShowTrailer(false);
    clearLaunchError();
  }, [clearLaunchError]);

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
      clearLaunchError();
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
    [clearLaunchError]
  );

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
          recentTrailers: readRecentTrailers(),
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
    rememberTrailers(trailerQueue);
  }, [trailerQueue]);

  const beginProviderLaunch = useCallback(() => {
    clearLaunchError();
    rememberExternalReturn({ bowlId, movie: drawnMovie });
  }, [bowlId, clearLaunchError, drawnMovie]);

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
  // the app cannot send the room straight back into it. The lights stay down
  // through a hand-off: the preroll lifts them behind the provider app a
  // moment later and ends through onFinish.
  const completeTheater = useCallback(() => {
    if (!autoStartCandidate) {
      endTheater();
      return;
    }
    beginProviderLaunch();
    noteLaunch(autoStartCandidate.url);
    window.open(autoStartCandidate.url, "_blank", "noopener,noreferrer");
  }, [endTheater, autoStartCandidate, beginProviderLaunch, noteLaunch]);

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
      // The trailer arrives with the details, and is where focus belongs.
      isHistoryEnriching,
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
        // The lights come up on the way out; with no overlay to ask, just end.
        if (!theaterRef.current?.leave?.()) endTheater();
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
    setCurtainOrigin(
      drawBowlRef.current?.closest(".tv-draw-cta")?.querySelector(".theater-curtains")?.getBoundingClientRect() || null
    );
    const startedAt = Date.now();
    const run = {
      startedAt,
      methodId: normalizeDrawMethod(bowlMeta.drawMethod),
      reducedMotion: Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches),
      originRect: drawBowlRef.current?.querySelector(".bowl-illustration-image")?.getBoundingClientRect() || null,
      preview: null,
      previewAt: null,
      reveal: null,
      resultAt: null,
      title: "",
    };
    revealRunRef.current = run;
    setRevealRun(run);
    const updateRun = (patch) => {
      if (revealRunRef.current?.startedAt !== startedAt) return;
      revealRunRef.current = { ...revealRunRef.current, ...patch };
      setRevealRun(revealRunRef.current);
    };
    setIsDrawing(true);

    try {
      const delay = new Promise((resolve) =>
        window.setTimeout(resolve, MIN_DRAW_ANIMATION_MS)
      );
      const drawPromise = handleDraw({
        ...drawOptions,
        onPoolResolved: (pool) => updateRun({
          preview: getDrawRevealPreview({ drawMethod: run.methodId, pool }),
          previewAt: Date.now() - startedAt,
        }),
      }).then(async (result) => {
        if (!result || revealRunRef.current?.startedAt !== startedAt) return null;
        const { drawReveal: reveal = null, ...movie } = result;
        startProviderLookup(movie);
        // A phone open on the bowl plays it too. The television is signed in
        // as whoever owns it, not whoever holds the remote, so it names nobody.
        announceDraw(buildLiveDraw({
          bowlMovieId: movie.id,
          title: movie.title,
          methodId: run.methodId,
          preview: revealRunRef.current?.preview || null,
          reveal,
        }));
        const resultAt = Date.now() - startedAt;
        updateRun({ reveal, resultAt, title: movie.title || "" });
        const { preview, previewAt } = revealRunRef.current;
        const { openAt } = getDrawRevealTimeline({ preview, previewAt, reveal, resultAt, reducedMotion: run.reducedMotion });
        const wait = Math.max(MIN_DRAW_ANIMATION_MS, openAt ?? 0) - (Date.now() - startedAt);
        // Enrichment runs during the reveal, but neither the result nor the
        // theater hand-off is published until the shared schedule finishes.
        const [detailedMovie] = await Promise.all([
          enrichDrawnMovie(movie),
          wait > 0 ? new Promise((resolve) => window.setTimeout(resolve, wait)) : Promise.resolve(),
        ]);
        return detailedMovie;
      });

      const [movie] = await Promise.all([drawPromise, delay]);
      if (!movie || revealRunRef.current?.startedAt !== startedAt) return;

      setDrawnMovie(movie);
      setIsTheaterPending(isTheaterModeEnabled);
      setIsTheaterPlaying(false);
      setShowTrailer(false);
      clearLaunchError();
    } finally {
      drawInFlightRef.current = false;
      setIsDrawing(false);
      setRevealRun(null);
      revealRunRef.current = null;
    }
  };

  // A draw made on a phone, played here from the start: the slips rise and
  // sort while the bowl is read again, and the reveal lands only on a draw
  // that read shows. The television takes one only when it is sitting on the
  // draw screen with nothing else up, which is also the only time it tells the
  // phones it is listening.
  const isIdleForAnnouncedDraw =
    !isDrawing &&
    !drawnMovie &&
    !showDrawConfirm &&
    !pendingReturn &&
    !selectedHistoryMovie &&
    !showTrailer &&
    !isTheaterPlaying &&
    !isAccessLoading &&
    !accessError;

  const playedAnnouncementsRef = useRef(new Set());
  const playAnnouncedDraw = async (draw) => {
    if (!isIdleForAnnouncedDraw || drawInFlightRef.current) {
      reloadBowl();
      return;
    }

    drawInFlightRef.current = true;
    clearExternalReturn();
    setTonightMessage(null);
    setCurtainOrigin(
      drawBowlRef.current?.closest(".tv-draw-cta")?.querySelector(".theater-curtains")?.getBoundingClientRect() || null
    );
    const startedAt = Date.now();
    const run = {
      startedAt,
      methodId: normalizeDrawMethod(draw.reveal?.methodId || draw.methodId || bowlMeta.drawMethod),
      reducedMotion: Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches),
      originRect: drawBowlRef.current?.querySelector(".bowl-illustration-image")?.getBoundingClientRect() || null,
      preview: draw.preview,
      previewAt: draw.preview ? 0 : null,
      reveal: null,
      resultAt: null,
      title: "",
      drawnBy: draw.drawnBy,
      announced: true,
    };
    revealRunRef.current = run;
    setRevealRun(run);
    setIsDrawing(true);

    try {
      const [loaded] = await Promise.all([
        reloadBowl(),
        new Promise((resolve) => window.setTimeout(resolve, MIN_DRAW_ANIMATION_MS)),
      ]);
      const drawn = findAnnouncedDraw(loaded?.watched, draw.bowlMovieId, { played: playedAnnouncementsRef.current });
      if (!drawn || revealRunRef.current?.startedAt !== startedAt) return;
      const reveal = verifyAnnouncedReveal(draw.reveal, drawn);
      const resultAt = Date.now() - startedAt;
      revealRunRef.current = { ...revealRunRef.current, reveal, resultAt, title: drawn.title || "" };
      setRevealRun(revealRunRef.current);
      startProviderLookup(drawn);
      const { openAt } = getDrawRevealTimeline({
        preview: run.preview,
        previewAt: run.previewAt,
        reveal,
        resultAt,
        reducedMotion: run.reducedMotion,
      });
      const wait = Math.max(MIN_DRAW_ANIMATION_MS, openAt ?? 0) - (Date.now() - startedAt);
      const [movie] = await Promise.all([
        enrichDrawnMovie(drawn),
        wait > 0 ? new Promise((resolve) => window.setTimeout(resolve, wait)) : Promise.resolve(),
      ]);
      if (revealRunRef.current?.startedAt !== startedAt) return;

      setDrawnMovie(movie);
      setIsTheaterPending(isTheaterModeEnabled);
      setIsTheaterPlaying(false);
      setShowTrailer(false);
      clearLaunchError();
    } finally {
      if (revealRunRef.current?.startedAt === startedAt) {
        drawInFlightRef.current = false;
        setIsDrawing(false);
        setRevealRun(null);
        revealRunRef.current = null;
      }
    }
  };

  const { announceDraw } = useBowlLiveDraw({
    bowlId,
    surface: "tv",
    available: isIdleForAnnouncedDraw,
    onDraw: playAnnouncedDraw,
  });

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
      <>
      {defaultDrawSettings.theaterModeEnabled && <TheaterRevealCurtains origin={curtainOrigin} />}
      <TvDrawingScreen
        bowlName={bowlMeta.name}
        revealRun={revealRun}
        poolCount={drawPoolCount}
        totalCount={drawPoolTotalCount}
        contributorReach={drawPoolContributorReach}
      />
      </>
    );
  }

  if (drawnMovie) {
    return (
      <>
        <TvRevealScreen
          bowlName={bowlMeta.name}
          movie={drawnMovie}
          isPreparingPreviews={isTheaterPending}
          showTrailer={showTrailer}
          isDialogOpen={Boolean(pendingReturn) || isTheaterPlaying}
          webLaunchCandidate={preferredWebLaunchCandidate}
          rentCandidate={rentCandidate}
          providerLaunchMessage={providerLaunchMessage}
          providerLaunchFailedUrl={launchError?.url}
          onProviderLaunch={beginProviderLaunch}
          onCloseTrailer={() => setShowTrailer(false)}
          onToggleTrailer={() => setShowTrailer((current) => !current)}
        />
        {isTheaterPlaying && (
          <TvTheaterPreroll
            queue={trailerQueue}
            featureTitle={drawnMovie.title}
            featureServiceName={autoStartCandidate?.serviceName}
            handsOff={Boolean(autoStartCandidate)}
            captions={Boolean(defaultDrawSettings.prerollCaptionsEnabled)}
            ref={theaterRef}
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
          isEnriching={isHistoryEnriching}
          showTrailer={showTrailer}
          isDialogOpen={Boolean(pendingReturn)}
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
            <div className="tv-tonight-heading">
              <h1 className="tv-tonight-title">{bowlMeta.name}</h1>
            </div>

            <div className="tv-tonight-mid">
              <div className="tv-tonight-left">
              <div className="tv-draw-cta">
              {!isPreferencesLoading && <TheaterCurtains enabled={Boolean(defaultDrawSettings.theaterModeEnabled)} />}
              {/* The bowl is the control: the largest thing here and the only
                  thing to do are the same object, with the label as the round
                  button under it, the way the phone stacks them. */}
              <button
                ref={drawBowlRef}
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
              {remainingCount > 0 && (shownDrawReadout ? (
                <TvDrawReadout
                  readout={shownDrawReadout.readout}
                  isApproximate={shownDrawReadout.isApproximate}
                  contributorReach={shownDrawReadout.reach}
                  memberCount={bowlMeta.memberCount}
                  drawMethod={bowlMeta.drawMethod}
                  excludedContributorCount={
                    shownDrawReadout.reach
                      ? shownDrawReadout.reach.totalCount - shownDrawReadout.reach.reachedCount
                      : 0
                  }
                />
              ) : (
                // Invisible rather than absent, so the line is already the
                // size the count will need and nothing under it moves.
                <p className="tv-draw-readout" style={{ visibility: "hidden" }} aria-hidden="true">
                  <span>Drawing from <strong>0</strong></span>
                </p>
              ))}
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
                  <TvTheaterToggle
                    enabled={Boolean(defaultDrawSettings.theaterModeEnabled)}
                    previewCount={theaterTrailerCount}
                    isOverridden={isTvOverridden("theaterModeEnabled")}
                    isCountOverridden={isTvOverridden("theaterTrailerCount")}
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
            <BowlIllustration className="tv-dialog-bowl" />
            <h2 id="tv-confirm-title">Draw a movie?</h2>
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
                Draw
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
