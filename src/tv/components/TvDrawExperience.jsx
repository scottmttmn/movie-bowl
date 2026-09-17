import BowlIllustration from "../../components/BowlIllustration";
import ProviderLinksAttribution from "../../components/ProviderLinksAttribution";
import AvailabilityAttribution from "../../components/AvailabilityAttribution";
import ServiceLogo from "../../components/ServiceLogo";
import { getBackdropUrl } from "../../utils/getBackdropUrl";
import { getPosterUrl } from "../../utils/getPosterUrl";
import { getProviderLogoUrl } from "../../utils/getProviderLogoUrl";
import { getMovieReleaseStatus } from "../../utils/movieReleaseStatus";
import { matchUserServices } from "../../utils/streamingServices";
import TvBrand from "./TvBrand";
import TvFullscreenTrailer from "./TvFullscreenTrailer";

function getYear(movie) {
  return movie?.release_date ? String(movie.release_date).split("-")[0] : "";
}

function getGenreNames(movie) {
  return (movie?.genres || [])
    .map((genre) => (typeof genre === "string" ? genre : genre?.name))
    .filter(Boolean);
}

export function TvDrawingScreen({
  bowlName,
  drawTitle,
  poolCount,
  totalCount,
  contributorReach,
  heading = "Drawing tonight's movie…",
  caption: captionOverride = null,
}) {
  const resolvedCount = poolCount ?? totalCount;
  const excludedCount = contributorReach
    ? contributorReach.totalCount - contributorReach.reachedCount
    : 0;
  const caption =
    captionOverride ||
    (excludedCount > 0
      ? `Tonight's eligible pool represents ${contributorReach.reachedCount} of ${contributorReach.totalCount} contributors.`
      : `${resolvedCount} eligible ${
          resolvedCount === 1 ? "movie is" : "movies are"
        } in tonight's draw.`);

  return (
    <main className="tv-drawing-screen" role="status" aria-live="polite">
      <p className="tv-kicker">{bowlName}</p>
      <h1>{heading}</h1>
      <BowlIllustration
        drawTitle={drawTitle}
        isDrawing
        className="tv-drawing-bowl"
      />
      <p className="tv-drawing-caption">{caption}</p>
    </main>
  );
}

export function TvMovieDetailStage({
  movie,
  streamingServices,
  showWhereToWatch = true,
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
    matchingServices.length > 0
      ? matchingServices
      : movie.streamingProviders || [];
  const providerLogos = movie.streamingProviderLogos || {};
  const runtimeLabel = movie.runtime ? `${movie.runtime} min` : null;
  const releaseStatus = movie.releaseStatus || getMovieReleaseStatus(movie);
  const availability = movie.streamingAvailability || {};
  const hasStructuredAvailability = ["subscription", "free", "ads", "rent", "buy"]
    .some((group) => Array.isArray(availability[group]) && availability[group].length > 0);
  const hasTransactionalAvailability = ["rent", "buy"]
    .some((group) => Array.isArray(availability[group]) && availability[group].length > 0);
  const trailer = movie.trailer;
  const canOfferLaunch = showWhereToWatch && Boolean(webLaunchCandidate?.url);
  const canLaunch = canOfferLaunch && !providerLaunchMessage;

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

        {releaseStatus.isExceptional && releaseStatus.label && (
          <p className={`tv-release-status${releaseStatus.state === "canceled" ? " is-canceled" : ""}`}>
            {releaseStatus.label}
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

        {showWhereToWatch && providerNames.length > 0 && (
          <div className="tv-provider-row">
            <span>Available on</span>
            {providerNames.slice(0, 4).map((provider) => {
              const logoUrl = getProviderLogoUrl(providerLogos[provider], "w92");
              return logoUrl ? (
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

        {showWhereToWatch && hasTransactionalAvailability && (
          <p className="tv-transactional-availability">Rent or buy options available</p>
        )}

        <div className="tv-reveal-actions">
          {canLaunch && (
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
              <ServiceLogo
                service={webLaunchCandidate.serviceName}
                className="tv-launch-logo"
              />
              Open {webLaunchCandidate.serviceName}
            </a>
          )}
          {canOfferLaunch && !canLaunch && (
            <button
              type="button"
              className="tv-button tv-button-secondary"
              data-tv-focusable
              data-tv-nav-group="reveal-actions"
              disabled
            >
              <ServiceLogo
                service={webLaunchCandidate.serviceName}
                className="tv-launch-logo"
              />
              Open {webLaunchCandidate.serviceName}
            </button>
          )}
          {trailer?.embedUrl && (
            <button
              type="button"
              className="tv-button tv-button-secondary"
              data-tv-focusable
              data-tv-nav-group="reveal-actions"
              data-tv-autofocus={playbackAutofocus && !canLaunch ? "true" : undefined}
              onClick={onToggleTrailer}
            >
              Watch trailer
            </button>
          )}
        </div>

        {showWhereToWatch && webLaunchCandidate?.linkType === "title" && (
          <ProviderLinksAttribution tv />
        )}

        {showWhereToWatch && (hasStructuredAvailability || movie.streamingWatchUrl) && (
          <AvailabilityAttribution tv />
        )}

        {showWhereToWatch && providerLaunchMessage && (
          <p className="tv-provider-launch-message" role="status">
            {providerLaunchMessage}
          </p>
        )}

        {children}
      </div>
    </section>
  );
}

export function TvRevealScreen({
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
  kicker = "Decision made",
  badgeLabel = "Tonight's pick",
  noteLabel = "Why it’s in the bowl",
  historyMetadata = [],
}) {
  const trailer = movie.trailer;
  const isCoveredByOverlay = isDialogOpen || showTrailer;
  const backdropUrl = getBackdropUrl(movie);

  return (
    <>
      <main
        className="tv-page tv-reveal-page is-kept"
        aria-hidden={isCoveredByOverlay ? "true" : undefined}
        inert={isCoveredByOverlay}
      >
        {backdropUrl && (
          <div className="tv-reveal-backdrop" aria-hidden="true">
            <img
              src={backdropUrl}
              alt=""
              fetchPriority="high"
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          </div>
        )}
        <header className="tv-topbar">
          <TvBrand />
          <div className="tv-reveal-bowl-name">{bowlName}</div>
        </header>

        <TvMovieDetailStage
          movie={movie}
          streamingServices={streamingServices}
          kicker={kicker}
          badgeLabel={badgeLabel}
          noteLabel={noteLabel}
          historyMetadata={historyMetadata}
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
