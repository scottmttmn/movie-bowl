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
import { fetchStreamingProviders } from "../../lib/streamingProviders";
import { getMovieAttributionLabel } from "../../utils/drawBuckets";
import { getDrawablePoolMovies } from "../../utils/drawPool";
import { getDrawReadout } from "../../utils/drawReadout";
import { getResolvedDrawPool } from "../../utils/drawSelection";
import { clampTheaterTrailerCount } from "../../utils/drawSettings";
import { getPosterUrl } from "../../utils/getPosterUrl";
import { getProviderLogoUrl } from "../../utils/getProviderLogoUrl";
import { getMovieFromDrawCandidate } from "../../utils/selectDrawCandidate";
import { matchUserServices } from "../../utils/streamingServices";

import useDrawPoolCount, { DRAW_POOL_STATUS } from "../../hooks/useDrawPoolCount";
import {
  STREAMING_MATCH_STATUS,
  STREAMING_MATCH_TONE,
} from "../../utils/streamingMatchSummary";
import { resolvePreferredLaunchTarget } from "../../utils/webLaunch";
import { canReturnDrawToBowl } from "../../utils/watchHistory";
import useDrawProviderLinks from "../../hooks/useDrawProviderLinks";
import TvVoiceHandoffCard from "../components/TvVoiceHandoffCard";
import ProviderLinksAttribution from "../../components/ProviderLinksAttribution";
import TvBrand from "../components/TvBrand";
import TvDrawPreferences from "../components/TvDrawPreferences";
import TvTheaterPreroll from "../components/TvTheaterPreroll";
import { useTvBowlAccess } from "../hooks/useTvBowls";
import useTvDrawSettings from "../hooks/useTvDrawSettings";
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

const TV_PICKED_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function getYear(movie) {
  return movie?.release_date ? String(movie.release_date).split("-")[0] : "";
}

function getGenreNames(movie) {
  return (movie?.genres || [])
    .map((genre) => (typeof genre === "string" ? genre : genre?.name))
    .filter(Boolean);
}

function formatPickedDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return TV_PICKED_DATE_FORMATTER.format(date);
}

function mergeHistoryMovieDetails(movie, details, providerData) {
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
    streamingProviders:
      providerData?.providers?.length > 0
        ? providerData.providers
        : movie.streamingProviders || [],
    streamingProviderLogos:
      providerData?.providerLogos || movie.streamingProviderLogos || {},
    streamingRegion:
      providerData?.region || movie.streamingRegion || "US",
  };
}

async function enrichHistoryMovie(movie, fetchProviders) {
  const tmdbId = Number(movie?.tmdb_id);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return movie;

  const [detailsResult, providersResult] = await Promise.allSettled([
    getTmdbMovieDetails(tmdbId),
    fetchProviders(tmdbId),
  ]);

  if (detailsResult.status === "rejected") {
    console.error(
      "[TvTonightScreen] Failed to enrich Watch History details",
      detailsResult.reason
    );
  }
  if (providersResult.status === "rejected") {
    console.error(
      "[TvTonightScreen] Failed to enrich Watch History providers",
      providersResult.reason
    );
  }

  return mergeHistoryMovieDetails(
    movie,
    detailsResult.status === "fulfilled" ? detailsResult.value : null,
    providersResult.status === "fulfilled" ? providersResult.value : null
  );
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
      streamingRegion: movie.streamingRegion || "US",
    };
  } catch (error) {
    console.error("[TvTonightScreen] Failed to enrich drawn movie", error);
    return movie;
  }
}

function TvTonightHeader({ onBack }) {
  return (
    <header className="tv-topbar">
      <TvBrand />
      <button
        type="button"
        className="tv-text-button"
        data-tv-focusable
        data-tv-nav-group="tonight-header"
        onClick={onBack}
      >
        ← Change bowl
      </button>
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

function TvRecentDraws({ movies, restoreFocusId, onFocusRestored, onSelect }) {
  const recentMovies = movies || [];
  if (recentMovies.length === 0) return null;

  return (
    <section className="tv-recent-section" aria-labelledby="tv-recent-title">
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

function TvMovieDetailStage({
  movie,
  streamingServices,
  kicker,
  badgeLabel,
  noteLabel = "Bowl note",
  historyMetadata = [],
  webLaunchCandidate,
  providerLaunchMessage,
  onProviderLaunch,
  onToggleTrailer,
  playbackAutofocus = true,
  children,
}) {
  const year = getYear(movie);
  const genres = getGenreNames(movie);
  const matchingServices = matchUserServices(
    movie.streamingProviders || [],
    streamingServices
  );
  const providerNames =
    matchingServices.length > 0 ? matchingServices : movie.streamingProviders || [];
  const providerLogos = movie.streamingProviderLogos || {};
  const runtimeLabel = movie.runtime ? `${movie.runtime} min` : null;
  const trailer = movie.trailer;

  return (
    <section className="tv-reveal is-kept">
      <div className="tv-poster-wrap">
        <img
          className="tv-reveal-poster"
          src={getPosterUrl(movie, "w500")}
          alt={`${movie.title} poster`}
        />
        {badgeLabel && <span className="tv-kept-badge">{badgeLabel}</span>}
      </div>

      <div className="tv-reveal-copy">
        <p className="tv-kicker">{kicker}</p>
        <h1>
          {movie.title}
          {year && <span> ({year})</span>}
        </h1>

        {(runtimeLabel || genres.length > 0) && (
          <p className="tv-movie-facts">
            {[runtimeLabel, ...genres.slice(0, 3)].filter(Boolean).join(" • ")}
          </p>
        )}

        {historyMetadata.length > 0 && (
          <p className="tv-history-metadata">
            {historyMetadata.filter(Boolean).join(" • ")}
          </p>
        )}

        {movie.overview && <p className="tv-overview">{movie.overview}</p>}

        {movie.note && (
          <div className="tv-movie-note">
            <span>{noteLabel}</span>
            <p>{movie.note}</p>
          </div>
        )}

        {providerNames.length > 0 && (
          <div className="tv-provider-row">
            <span>Available on</span>
            {providerNames.slice(0, 4).map((provider) => {
              const logoUrl = getProviderLogoUrl(providerLogos[provider], "w92");
              return logoUrl ? (
                // The name stays as the alt text, so a logo that fails to load
                // on a television's connection leaves the row as it was.
                <img
                  key={provider}
                  className="tv-provider-logo"
                  src={logoUrl}
                  alt={provider}
                />
              ) : (
                <strong key={provider}>{provider}</strong>
              );
            })}
          </div>
        )}

        <div className="tv-reveal-actions">
          {webLaunchCandidate?.url && (
            <a
              className="tv-button tv-button-secondary"
              data-tv-focusable
              data-tv-nav-group="reveal-actions"
              data-tv-autofocus={playbackAutofocus ? "true" : undefined}
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
                playbackAutofocus && !webLaunchCandidate?.url ? "true" : undefined
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

        {children}
      </div>
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
  const trailer = movie.trailer;

  // aria-hidden hides this from assistive tech and from our own navigation
  // hook's filter, but it is not a focus guard. The television's WebView runs
  // its own D-pad traversal when the page does not handle a key, and that walks
  // straight into these controls: right then OK during previews opened the
  // provider app. inert takes them out of the focus order itself, which is the
  // only thing that holds when our JS never sees the press.
  const isCoveredByOverlay = isDialogOpen || showTrailer;

  return (
    <>
      <main
        className="tv-page tv-reveal-page is-kept"
        aria-hidden={isCoveredByOverlay ? "true" : undefined}
        inert={isCoveredByOverlay}
      >
        <header className="tv-topbar">
          <TvBrand />
          <div className="tv-reveal-bowl-name">{bowlName}</div>
        </header>

        <TvMovieDetailStage
          movie={movie}
          streamingServices={streamingServices}
          kicker="Decision made"
          badgeLabel="Tonight's pick"
          noteLabel="Why it’s in the bowl"
          webLaunchCandidate={webLaunchCandidate}
          providerLaunchMessage={providerLaunchMessage}
          onProviderLaunch={onProviderLaunch}
          onToggleTrailer={onToggleTrailer}
        >
          {isPreparingPreviews && (
            <p className="tv-preview-status" role="status">
              Loading previews…
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

function TvHistoryDetailScreen({
  bowlName,
  movie,
  streamingServices,
  canReturn,
  returnWindowClosed,
  isEnriching,
  showTrailer,
  isDialogOpen,
  webLaunchCandidate,
  providerLaunchMessage,
  onProviderLaunch,
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
          streamingServices={streamingServices}
          kicker="Previously picked"
          historyMetadata={historyMetadata}
          webLaunchCandidate={webLaunchCandidate}
          providerLaunchMessage={providerLaunchMessage}
          onProviderLaunch={onProviderLaunch}
          onToggleTrailer={onToggleTrailer}
          playbackAutofocus={false}
        >
          {isEnriching && (
            <p className="tv-preview-status" role="status">
              Loading trailer and availability…
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
    clearOverrides: clearTvSettings,
  } = useTvDrawSettings(userId, accountDrawSettings);

  const [showDrawConfirm, setShowDrawConfirm] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawAnimationTitle, setDrawAnimationTitle] = useState("");
  const [drawnMovie, setDrawnMovie] = useState(() => readExternalReturn(bowlId));
  const [selectedHistoryMovie, setSelectedHistoryMovie] = useState(null);
  const [historyFocusId, setHistoryFocusId] = useState(null);
  const [isHistoryEnriching, setIsHistoryEnriching] = useState(false);
  const activeDetailMovie = drawnMovie || selectedHistoryMovie;
  const { providerLinks, startLookup: startProviderLookup } = useDrawProviderLinks(
    bowlId,
    activeDetailMovie
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
    () => getAvailableGenres(bowl.remaining),
    [bowl.remaining]
  );
  const drawOptions = useMemo(
    () => buildDrawOptions(defaultDrawSettings, streamingServices, availableGenres),
    [defaultDrawSettings, streamingServices, availableGenres]
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
  // A television cannot offer the opt-in scan the phone does, so a bowl too
  // large to count on its own never gets an exact number here. "up to" is the
  // honest version of that rather than a count the filters have not touched.
  const isDrawReadoutApproximate =
    drawPoolStatus !== DRAW_POOL_STATUS.ready &&
    drawPoolStatus !== DRAW_POOL_STATUS.unfiltered;
  const preferredWebLaunchCandidate = useMemo(() => {
    if (!activeDetailMovie) return null;

    return resolvePreferredLaunchTarget({
      providerLinks,
      userServices: streamingServices,
      movieProviders: activeDetailMovie.streamingProviders || [],
      title: activeDetailMovie.title || "",
    });
  }, [activeDetailMovie, streamingServices, providerLinks]);

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

      const fetchProviders =
        filterMetadataFetchers?.fetchProviders || fetchStreamingProviders;

      enrichHistoryMovie(movie, fetchProviders)
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
    [filterMetadataFetchers]
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
          streamingServices={streamingServices}
          canReturn={bowlMeta.canDraw && canReturnDrawToBowl(selectedHistoryMovie)}
          returnWindowClosed={
            bowlMeta.canDraw && !canReturnDrawToBowl(selectedHistoryMovie)
          }
          isEnriching={isHistoryEnriching}
          showTrailer={showTrailer}
          isDialogOpen={Boolean(pendingReturn)}
          webLaunchCandidate={preferredWebLaunchCandidate}
          providerLaunchMessage={providerLaunchMessage}
          onProviderLaunch={() => setProviderLaunchMessage(null)}
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
        <TvTonightHeader onBack={chooseAnotherBowl} />

        <section className="tv-tonight-grid">
          <div className="tv-tonight-stage">
            <div className="tv-tonight-stage-copy">
              <h1>{bowlMeta.name}</h1>
            </div>

            <BowlIllustration className="tv-tonight-bowl" />

            <div className="tv-draw-cta">
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
            </div>
          </div>

          <TvDrawPreferences
            settings={defaultDrawSettings}
            streamingServices={streamingServices}
            drawMethod={bowlMeta.drawMethod}
            overriddenSettings={overriddenSettings}
            hasOverrides={hasOverrides}
            isPersisted={areTvSettingsPersisted}
            isLoading={isPreferencesLoading}
            onToggle={setTvSetting}
            onReset={clearTvSettings}
          />
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
