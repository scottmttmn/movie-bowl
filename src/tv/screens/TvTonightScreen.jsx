import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import BowlIllustration from "../../components/BowlIllustration";
import useBowl from "../../hooks/useBowl";
import useUserStreamingServices from "../../hooks/useUserStreamingServices";
import { getTmdbMovieDetails } from "../../lib/tmdbApi";
import { getDrawMethod } from "../../utils/drawMethods";
import { getDrawablePoolMovies } from "../../utils/drawPool";
import { getResolvedDrawPool } from "../../utils/drawSelection";
import { clampTheaterTrailerCount } from "../../utils/drawSettings";
import { getPosterUrl } from "../../utils/getPosterUrl";
import { getMovieFromDrawCandidate } from "../../utils/selectDrawCandidate";
import { matchUserServices } from "../../utils/streamingServices";
import { STREAMING_MATCH_STATUS } from "../../hooks/useBowlStreamingMatches";
import useDrawPoolCount, { DRAW_POOL_STATUS } from "../../hooks/useDrawPoolCount";
import {
  describeStreamingMatch,
  STREAMING_MATCH_TONE,
} from "../../utils/streamingMatchSummary";
import { resolvePreferredLaunchTarget } from "../../utils/webLaunch";
import useDrawProviderLinks from "../../hooks/useDrawProviderLinks";
import TvVoiceHandoffCard from "../components/TvVoiceHandoffCard";
import ProviderLinksAttribution from "../../components/ProviderLinksAttribution";
import TvBrand from "../components/TvBrand";
import TvTheaterPreroll from "../components/TvTheaterPreroll";
import { useTvBowlAccess } from "../hooks/useTvBowls";
import useTvSpatialNavigation from "../hooks/useTvSpatialNavigation";
import {
  buildTrailerQueue,
  readRecentTrailerKeys,
  rememberTrailerKeys,
} from "../utils/theaterQueue";
import {
  clearExternalReturn,
  readExternalReturn,
  rememberExternalReturn,
} from "../utils/externalReturn";
import {
  getAutoplayTrailerUrl,
  getYouTubeVideoId,
  loadYouTubeIframeApi,
} from "../utils/youtubePlayer";

const MIN_DRAW_ANIMATION_MS = 1800;

// Avoid leaving the result screen in a permanent loading state if preview
// enrichment stalls. The Android wrapper explicitly permits media autoplay.
const MAX_PREVIEW_WAIT_MS = 2500;

function getYear(movie) {
  return movie?.release_date ? String(movie.release_date).split("-")[0] : "";
}

function getGenreNames(movie) {
  return (movie?.genres || [])
    .map((genre) => (typeof genre === "string" ? genre : genre?.name))
    .filter(Boolean);
}

// Previews run through the same resolver the draw uses, so the pre-roll shows
// titles that could actually come up next instead of anything left in the bowl.
// The rating and provider caches are warm from the draw that just ran, so this
// normally resolves without a network round trip.
async function resolveEligiblePreviewIds({ movies, drawOptions, fetchers }) {
  try {
    const { candidates } = await getResolvedDrawPool({
      remainingMovies: getDrawablePoolMovies(movies),
      ...drawOptions,
      fetchMovieDetails: fetchers.fetchMovieDetails,
      fetchProviders: fetchers.fetchProviders,
      fetchFilterMetadata: fetchers.fetchFilterMetadata,
    });
    return candidates
      .map((candidate) => getMovieFromDrawCandidate(candidate)?.id)
      .filter(Boolean);
  } catch (error) {
    console.error("[TvTonightScreen] Failed to resolve the eligible preview pool", error);
    // Previews degrade to the whole bowl rather than losing the pre-roll.
    return null;
  }
}

async function fetchMovieTrailer(movie) {
  try {
    const details = await getTmdbMovieDetails(Number(movie?.tmdb_id));
    return details?.trailer || null;
  } catch (error) {
    console.error("[TvTonightScreen] Failed to load a preview trailer", error);
    return null;
  }
}

function getAvailableGenres(movies) {
  return [
    ...new Set(
      (movies || []).flatMap((movie) =>
        (movie?.genres || [])
          .map((genre) => (typeof genre === "string" ? genre : genre?.name))
          .filter(Boolean)
      )
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function buildDrawOptions(defaultDrawSettings, streamingServices, availableGenres) {
  const settings = defaultDrawSettings || {};
  const selectedGenres = Array.isArray(settings.selectedGenres)
    ? settings.selectedGenres.filter((genre) => availableGenres.includes(genre))
    : availableGenres;

  return {
    prioritizeByServices: Boolean(settings.prioritizeStreaming),
    prioritizeByServiceRank: Boolean(settings.useStreamingRank),
    userStreamingServices: streamingServices,
    ratingFilter: {
      allowedRatings: settings.selectedRatings || [],
      includeUnknown: Boolean(settings.includeUnknownRatings),
    },
    genreFilter: {
      allowedGenres: selectedGenres,
      includeUnknown: Boolean(settings.includeUnknownGenres),
    },
    runtimeFilter: {
      minMinutes: Number(settings.runtimeMinMinutes || 0),
      maxMinutes: Number(settings.runtimeMaxMinutes || 500),
      includeUnknown: Boolean(settings.includeUnknownRuntime),
    },
  };
}

// The streaming line is built separately because it carries a count and a
// state; everything below it is a plain restatement of a saved filter.
function getStreamingPreferenceLine({
  defaultDrawSettings,
  streamingServices,
  matchStatus,
  matchCount,
  topService,
  topServiceCount,
}) {
  const settings = defaultDrawSettings || {};
  const isPrioritized = Boolean(settings.prioritizeStreaming) && streamingServices.length > 0;

  // Bowls too large to count without asking keep the old service list, since a
  // television has nowhere to put an opt-in tap.
  if (matchStatus !== STREAMING_MATCH_STATUS.ready) {
    return {
      tone: STREAMING_MATCH_TONE.idle,
      text: isPrioritized
        ? `Favoring ${streamingServices.join(", ")}`
        : "Drawing from every eligible movie",
    };
  }

  const { tone, text } = describeStreamingMatch({
    matchCount,
    topService,
    topServiceCount,
    isPrioritized,
    useServiceRank: Boolean(settings.useStreamingRank),
  });

  return { tone, text };
}

function getDrawPoolPreferenceLine({ status, poolCount, totalCount, contributorReach }) {
  if (totalCount === 0) {
    return { tone: STREAMING_MATCH_TONE.idle, text: "No titles are ready to draw" };
  }
  if (status === DRAW_POOL_STATUS.manual) {
    return {
      tone: STREAMING_MATCH_TONE.warning,
      text: "Open Movie Bowl on your phone to count the exact eligible pool",
    };
  }
  if (status === DRAW_POOL_STATUS.counting) {
    return {
      tone: STREAMING_MATCH_TONE.idle,
      text: `${totalCount} ${totalCount === 1 ? "title" : "titles"} in bowl`,
    };
  }

  const resolvedCount = status === DRAW_POOL_STATUS.unfiltered ? totalCount : poolCount;
  const excludedCount = contributorReach
    ? contributorReach.totalCount - contributorReach.reachedCount
    : 0;
  const titleText =
    resolvedCount === totalCount
      ? `All ${totalCount} ${totalCount === 1 ? "title" : "titles"} eligible`
      : `${resolvedCount} of ${totalCount} titles eligible`;

  if (excludedCount > 0) {
    return {
      tone: STREAMING_MATCH_TONE.warning,
      text: `${titleText}; ${contributorReach.reachedCount} of ${contributorReach.totalCount} contributors represented`,
    };
  }

  return {
    tone:
      resolvedCount === totalCount ? STREAMING_MATCH_TONE.idle : STREAMING_MATCH_TONE.active,
    text: titleText,
  };
}

function getPreferenceLines(defaultDrawSettings) {
  const settings = defaultDrawSettings || {};
  const lines = [];

  const ratings = settings.selectedRatings || [];
  if (ratings.length > 0 && ratings.length < 5) {
    lines.push(`Ratings: ${ratings.join(", ")}`);
  }

  if (Array.isArray(settings.selectedGenres) && settings.selectedGenres.length > 0) {
    lines.push(
      settings.selectedGenres.length <= 3
        ? `Genres: ${settings.selectedGenres.join(", ")}`
        : `${settings.selectedGenres.length} selected genres`
    );
  }

  const minRuntime = Number(settings.runtimeMinMinutes || 0);
  const maxRuntime = Number(settings.runtimeMaxMinutes || 500);
  if (minRuntime > 0 || maxRuntime < 500) {
    lines.push(`${minRuntime}–${maxRuntime} minutes`);
  }

  if (settings.theaterModeEnabled) {
    const previewCount = clampTheaterTrailerCount(settings.theaterTrailerCount);
    lines.push(
      `Theater mode: ${previewCount} ${previewCount === 1 ? "preview" : "previews"}`
    );
  }

  return lines;
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
      streamingRegion: movie.streamingRegion || "US",
    };
  } catch (error) {
    console.error("[TvTonightScreen] Failed to enrich drawn movie", error);
    return movie;
  }
}

function TvTonightHeader({ bowlName, userEmail, onBack }) {
  return (
    <header className="tv-topbar tv-tonight-topbar">
      <TvBrand context="Tonight" />
      <div className="tv-tonight-heading">
        <span className="tv-tonight-heading-label">Current bowl</span>
        <strong>{bowlName}</strong>
      </div>
      <div className="tv-tonight-actions">
        <span className="tv-viewer-email">{userEmail}</span>
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

function TvDrawingScreen({ bowlName, drawTitle, poolCount, totalCount, contributorReach }) {
  const resolvedCount = poolCount ?? totalCount;
  const excludedCount = contributorReach
    ? contributorReach.totalCount - contributorReach.reachedCount
    : 0;
  const caption =
    excludedCount > 0
      ? `Tonight's eligible pool represents ${contributorReach.reachedCount} of ${contributorReach.totalCount} contributors.`
      : `${resolvedCount} eligible ${resolvedCount === 1 ? "movie is" : "movies are"} in tonight's draw.`;

  return (
    <main className="tv-drawing-screen" role="status" aria-live="polite">
      <p className="tv-kicker">{bowlName}</p>
      <h1>Drawing tonight&apos;s movie…</h1>
      <BowlIllustration
        drawTitle={drawTitle}
        isDrawing
        className="tv-drawing-bowl"
      />
      <p className="tv-drawing-caption">{caption}</p>
    </main>
  );
}

function TvRecentDraws({ movies, onSelect }) {
  const recentMovies = movies || [];
  if (recentMovies.length === 0) return null;

  return (
    <section className="tv-recent-section" aria-labelledby="tv-recent-title">
      <div>
        <p className="tv-kicker">From this bowl</p>
        <h2 id="tv-recent-title">Watch History</h2>
        <p className="tv-recent-help">Select a title to return it to the bowl.</p>
      </div>
      <div className="tv-recent-list">
        {recentMovies.map((movie) => (
          <button
            type="button"
            className="tv-recent-movie"
            key={movie.drawEventId || movie.id}
            data-tv-focusable
            data-tv-nav-group="watch-history"
            aria-label={`Move ${movie.title} from Watch History back to the bowl`}
            onClick={() => onSelect(movie)}
          >
            <img src={getPosterUrl(movie, "w185")} alt="" />
            <span>
              <strong>{movie.title}</strong>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TvFullscreenTrailer({ movieTitle, trailer, onClose }) {
  const playerId = `tv-trailer-${useId().replace(/:/g, "")}`;
  const overlayRef = useRef(null);
  const playerRef = useRef(null);
  const enteredFullscreenRef = useRef(false);
  const videoId = getYouTubeVideoId(trailer);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return undefined;

    const getFullscreenElement = () =>
      document.fullscreenElement || document.webkitFullscreenElement;
    const handleFullscreenChange = () => {
      if (getFullscreenElement() === overlay) {
        enteredFullscreenRef.current = true;
      } else if (enteredFullscreenRef.current) {
        enteredFullscreenRef.current = false;
        onClose();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    const requestFullscreen =
      overlay.requestFullscreen || overlay.webkitRequestFullscreen;
    if (requestFullscreen) {
      Promise.resolve(requestFullscreen.call(overlay)).catch(() => {
        // The full-viewport overlay remains the fallback when native fullscreen
        // is unavailable or blocked by the television browser.
      });
    }

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
    };
  }, [onClose]);

  useEffect(() => {
    if (!videoId) return undefined;

    let cancelled = false;

    loadYouTubeIframeApi()
      .then((youtube) => {
        if (cancelled || !youtube?.Player) return;

        playerRef.current = new youtube.Player(playerId, {
          events: {
            onReady: (event) => event.target.playVideo(),
            onStateChange: (event) => {
              if (
                event.data === 0 ||
                event.data === youtube.PlayerState?.ENDED
              ) {
                onClose();
              }
            },
          },
        });
      })
      .catch((error) => {
        console.error("[TvFullscreenTrailer] Player API unavailable", error);
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [onClose, playerId, videoId]);

  return (
    <section
      ref={overlayRef}
      className="tv-trailer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${movieTitle} trailer`}
    >
      <iframe
        id={playerId}
        src={getAutoplayTrailerUrl(trailer)}
        title={`${movieTitle} trailer`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
      <button
        type="button"
        className="tv-trailer-close"
        data-tv-focusable
        data-tv-nav-group="trailer"
        data-tv-autofocus="true"
        onClick={onClose}
      >
        Close trailer
      </button>
    </section>
  );
}

function TvRevealScreen({
  bowlName,
  movie,
  streamingServices,
  isPreparingPreviews,
  showTrailer,
  isDialogOpen,
  webLaunchCandidate,
  providerLaunchMessage,
  onProviderLaunch,
  onCloseTrailer,
  onToggleTrailer,
}) {
  const year = getYear(movie);
  const genres = getGenreNames(movie);
  const matchingServices = matchUserServices(
    movie.streamingProviders || [],
    streamingServices
  );
  const providerNames =
    matchingServices.length > 0 ? matchingServices : movie.streamingProviders || [];
  const runtimeLabel = movie.runtime ? `${movie.runtime} min` : null;
  const trailer = movie.trailer;

  return (
    <>
      <main
        className="tv-page tv-reveal-page is-kept"
        aria-hidden={isDialogOpen || showTrailer ? "true" : undefined}
      >
        <header className="tv-topbar">
          <TvBrand context="Tonight’s movie" />
          <div className="tv-reveal-bowl-name">{bowlName}</div>
        </header>

        <section className="tv-reveal is-kept">
          <div className="tv-poster-wrap">
            <img
              className="tv-reveal-poster"
              src={getPosterUrl(movie, "w500")}
              alt={`${movie.title} poster`}
            />
            <span className="tv-kept-badge">Tonight&apos;s pick</span>
          </div>

          <div className="tv-reveal-copy">
            <p className="tv-kicker">Decision made</p>
            <h1>
              {movie.title}
              {year && <span> ({year})</span>}
            </h1>

            {(runtimeLabel || genres.length > 0) && (
              <p className="tv-movie-facts">
                {[runtimeLabel, ...genres.slice(0, 3)].filter(Boolean).join(" • ")}
              </p>
            )}

            {movie.overview && <p className="tv-overview">{movie.overview}</p>}

            {movie.note && (
              <div className="tv-movie-note">
                <span>Why it’s in the bowl</span>
                <p>{movie.note}</p>
              </div>
            )}

            {providerNames.length > 0 && (
              <div className="tv-provider-row">
                <span>Available on</span>
                {providerNames.slice(0, 4).map((provider) => (
                  <strong key={provider}>{provider}</strong>
                ))}
              </div>
            )}

            <div className="tv-reveal-actions">
              {webLaunchCandidate?.url && (
                <a
                  className="tv-button tv-button-secondary"
                  data-tv-focusable
                  data-tv-nav-group="reveal-actions"
                  data-tv-autofocus="true"
                  href={webLaunchCandidate.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onProviderLaunch}
                >
                  Open {webLaunchCandidate.serviceName}
                </a>
              )}
              {trailer?.embedUrl && (
                <button
                  type="button"
                  className="tv-button tv-button-secondary"
                  data-tv-focusable
                  data-tv-nav-group="reveal-actions"
                  data-tv-autofocus={
                    !webLaunchCandidate?.url ? "true" : undefined
                  }
                  onClick={onToggleTrailer}
                >
                  Watch trailer
                </button>
              )}
            </div>

            <TvVoiceHandoffCard title={movie.title} launchTarget={webLaunchCandidate} />
            {webLaunchCandidate?.linkType === "title" && <ProviderLinksAttribution tv />}

            {providerLaunchMessage && (
              <p className="tv-provider-launch-message" role="status">
                {providerLaunchMessage}
              </p>
            )}

            {isPreparingPreviews && (
              <p className="tv-preview-status" role="status">
                Loading previews…
              </p>
            )}
          </div>
        </section>

        <footer className="tv-remote-hint" aria-hidden="true">
          <span>Use ↑ ↓ ← → to move</span>
          <span>OK to select</span>
          <span>Back to return</span>
        </footer>
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
        <h2 id="tv-return-title">Move “{title}” back to the bowl?</h2>
        <p>
          Use this when your group decided not to watch it. It will be removed
          from everyone’s Watch History.
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
            Keep in history
          </button>
          <button
            type="button"
            className="tv-button tv-button-quiet"
            data-tv-focusable
            data-tv-nav-group="return-dialog"
            disabled={isReturning}
            onClick={onConfirm}
          >
            {isReturning ? "Returning to bowl…" : "Return to bowl"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function TvTonightScreen({ userId, userEmail }) {
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
    defaultDrawSettings,
    loading: isPreferencesLoading,
  } = useUserStreamingServices();

  const [showDrawConfirm, setShowDrawConfirm] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawAnimationTitle, setDrawAnimationTitle] = useState("");
  const [drawnMovie, setDrawnMovie] = useState(() => readExternalReturn(bowlId));
  const { providerLinks, startLookup: startProviderLookup } = useDrawProviderLinks(bowlId, drawnMovie);
  const [showTrailer, setShowTrailer] = useState(false);
  const [pendingReturn, setPendingReturn] = useState(null);
  const [isReturningMovie, setIsReturningMovie] = useState(false);
  const [returnErrorMessage, setReturnErrorMessage] = useState(null);
  const [tonightMessage, setTonightMessage] = useState(null);
  const [trailerQueue, setTrailerQueue] = useState([]);
  const [trailerQueueStatus, setTrailerQueueStatus] = useState("idle");
  const [isTheaterPending, setIsTheaterPending] = useState(false);
  const [isTheaterPlaying, setIsTheaterPlaying] = useState(false);
  const [providerLaunchMessage, setProviderLaunchMessage] = useState(null);
  const drawInFlightRef = useRef(false);

  const isTheaterModeEnabled = Boolean(defaultDrawSettings?.theaterModeEnabled);
  const theaterTrailerCount = clampTheaterTrailerCount(
    defaultDrawSettings?.theaterTrailerCount
  );

  const availableGenres = useMemo(
    () => getAvailableGenres(bowl.remaining),
    [bowl.remaining]
  );
  const drawOptions = useMemo(
    () => buildDrawOptions(defaultDrawSettings, streamingServices, availableGenres),
    [defaultDrawSettings, streamingServices, availableGenres]
  );
  const preferenceLines = useMemo(
    () => getPreferenceLines(defaultDrawSettings),
    [defaultDrawSettings]
  );
  // Held in refs rather than the preview effect's deps, the same trade-off
  // useDrawPoolCount makes: the pre-roll describes the draw that just ran, so a
  // fetcher identity settling underneath it must not rebuild the queue.
  const drawOptionsRef = useRef(drawOptions);
  drawOptionsRef.current = drawOptions;
  const filterMetadataFetchersRef = useRef(filterMetadataFetchers);
  filterMetadataFetchersRef.current = filterMetadataFetchers;
  const {
    status: drawPoolStatus,
    poolCount: drawPoolCount,
    totalCount: drawPoolTotalCount,
    contributorReach: drawPoolContributorReach,
    streamingMatch: drawPoolStreamingMatch,
  } = useDrawPoolCount(bowl.remaining, drawOptions, filterMetadataFetchers);
  const isStreamingPrioritized =
    Boolean(drawOptions.prioritizeByServices) && streamingServices.length > 0;
  const hasResolvedPrioritizedPool =
    isStreamingPrioritized &&
    drawPoolTotalCount > 0 &&
    (drawPoolStatus === DRAW_POOL_STATUS.ready ||
      drawPoolStatus === DRAW_POOL_STATUS.unfiltered);
  const streamingPreferenceLine = useMemo(
    () =>
      getStreamingPreferenceLine({
        defaultDrawSettings,
        streamingServices,
        matchStatus: hasResolvedPrioritizedPool
          ? STREAMING_MATCH_STATUS.ready
          : STREAMING_MATCH_STATUS.unavailable,
        matchCount: hasResolvedPrioritizedPool
          ? drawPoolStreamingMatch.matchCount
          : null,
        topService: hasResolvedPrioritizedPool
          ? drawPoolStreamingMatch.topService
          : null,
        topServiceCount: hasResolvedPrioritizedPool
          ? drawPoolStreamingMatch.topServiceCount
          : 0,
      }),
    [
      defaultDrawSettings,
      streamingServices,
      hasResolvedPrioritizedPool,
      drawPoolStreamingMatch,
    ]
  );
  const drawPoolPreferenceLine = useMemo(
    () =>
      getDrawPoolPreferenceLine({
        status: drawPoolStatus,
        poolCount: drawPoolCount,
        totalCount: drawPoolTotalCount,
        contributorReach: drawPoolContributorReach,
      }),
    [
      drawPoolStatus,
      drawPoolCount,
      drawPoolTotalCount,
      drawPoolContributorReach,
    ]
  );
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

  useTvSpatialNavigation({
    scopeKey: [
      "tonight",
      bowlId,
      isAccessLoading,
      isBowlLoading,
      showDrawConfirm,
      isDrawing,
      drawnMovie?.id || "",
      showTrailer,
      isTheaterPlaying,
      pendingReturn?.drawEventId || "",
      Boolean(accessError),
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
      setPendingReturn(null);
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
          onProviderLaunch={() => {
            setProviderLaunchMessage(null);
            rememberExternalReturn({ bowlId, movie: drawnMovie });
          }}
          onCloseTrailer={() => setShowTrailer(false)}
          onToggleTrailer={() => setShowTrailer((current) => !current)}
        />
        {isTheaterPlaying && (
          <TvTheaterPreroll
            queue={trailerQueue}
            featureTitle={drawnMovie.title}
            onFinish={endTheater}
            onExit={endTheater}
          />
        )}
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

  return (
    <main className="tv-page tv-tonight-page">
      <div
        aria-hidden={showDrawConfirm || pendingReturn ? "true" : undefined}
      >
        <TvTonightHeader
          bowlName={bowlMeta.name}
          userEmail={userEmail}
          onBack={chooseAnotherBowl}
        />

        <section className="tv-tonight-grid">
          <div className="tv-tonight-stage">
            <div className="tv-tonight-stage-copy">
              <p className="tv-kicker">Ready for movie night?</p>
              <h1>Let the bowl decide.</h1>
              <p>
                One press starts the draw using this user&apos;s saved preferences.
              </p>
            </div>

            <BowlIllustration className="tv-tonight-bowl" />

            <div className="tv-draw-cta">
              <button
                type="button"
                className="tv-draw-button"
                data-tv-focusable
                data-tv-nav-group="primary-draw"
                data-tv-autofocus="true"
                disabled={drawDisabled}
                onClick={() => {
                  setTonightMessage(null);
                  setShowDrawConfirm(true);
                }}
              >
                <span>Draw a movie</span>
                <small>
                  {drawPoolStatus === DRAW_POOL_STATUS.ready
                    ? `${drawPoolCount} of ${remainingCount} movies eligible`
                    : drawPoolStatus === DRAW_POOL_STATUS.unfiltered
                      ? `${remainingCount} ${remainingCount === 1 ? "movie" : "movies"} eligible`
                      : `${remainingCount} ${remainingCount === 1 ? "movie" : "movies"} in bowl`}
                </small>
              </button>
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
            </div>
          </div>

          <aside className="tv-preference-panel">
            <p className="tv-kicker">Tonight&apos;s setup</p>
            <h2>Your saved draw preferences</h2>
            {isPreferencesLoading ? (
              <p>Loading preferences…</p>
            ) : (
              <ul>
                <li
                  data-tone={drawPoolPreferenceLine.tone}
                  className={
                    drawPoolPreferenceLine.tone === STREAMING_MATCH_TONE.warning
                      ? "tv-preference-warning"
                      : undefined
                  }
                >
                  <span aria-hidden="true">
                    {drawPoolPreferenceLine.tone === STREAMING_MATCH_TONE.warning ? "!" : "✓"}
                  </span>
                  {drawPoolPreferenceLine.text}
                </li>
                <li
                  data-tone={streamingPreferenceLine.tone}
                  className={
                    streamingPreferenceLine.tone === STREAMING_MATCH_TONE.warning
                      ? "tv-preference-warning"
                      : undefined
                  }
                >
                  <span aria-hidden="true">
                    {streamingPreferenceLine.tone === STREAMING_MATCH_TONE.warning ? "!" : "✓"}
                  </span>
                  {streamingPreferenceLine.text}
                </li>
                {preferenceLines.map((line) => (
                  <li key={line}>
                    <span aria-hidden="true">✓</span>
                    {line}
                  </li>
                ))}
                <li>
                  <span aria-hidden="true">✓</span>
                  {getDrawMethod(bowlMeta.drawMethod).tvLabel}
                </li>
              </ul>
            )}
            <p className="tv-preference-note">
              Change services and filters from Movie Bowl on your phone.
            </p>
          </aside>
        </section>

        <TvRecentDraws
          movies={bowl.watched}
          onSelect={requestReturnFromHistory}
        />

        <footer className="tv-remote-hint" aria-hidden="true">
          <span>Use ↑ ↓ ← → to move</span>
          <span>OK to select</span>
          <span>Back to choose a bowl</span>
        </footer>
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
