import { useState } from "react";
import BowlIllustration from "../../components/BowlIllustration";
import DrawRevealStage from "../../components/DrawRevealStage";
import { getDrawMethod } from "../../utils/drawMethods";
import { getDrawRevealAnnouncement } from "../../utils/drawReveal";
import ProviderLinksAttribution from "../../components/ProviderLinksAttribution";
import AvailabilityAttribution from "../../components/AvailabilityAttribution";
import ServiceLogo from "../../components/ServiceLogo";
import { getBackdropUrl } from "../../utils/getBackdropUrl";
import { getPosterUrl } from "../../utils/getPosterUrl";
import { getProviderLogoUrl } from "../../utils/getProviderLogoUrl";
import { getMovieAttributionLabel, isStarterPackMovie } from "../../utils/drawBuckets";
import { getMovieReleaseStatus } from "../../utils/movieReleaseStatus";
import { normalizeRentalStore } from "../../utils/rentalStores";
import { matchUserServices } from "../../utils/streamingServices";
import { isFailedLaunchUrl } from "../../utils/webLaunch";
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
  revealRun = null,
}) {
  const [phase, setPhase] = useState("gather");
  if (revealRun) {
    const announcement = getDrawRevealAnnouncement(revealRun.reveal, phase);
    return (
      <main>
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {bowlName}. {announcement || heading}
        </div>
        <DrawRevealStage
          method={getDrawMethod(revealRun.methodId)}
          preview={revealRun.preview}
          previewAt={revealRun.previewAt}
          reveal={revealRun.reveal}
          resultAt={revealRun.resultAt}
          startedAt={revealRun.startedAt}
          title={revealRun.title}
          originRect={revealRun.originRect}
          reducedMotion={revealRun.reducedMotion}
          presentation="tv"
          onPhaseChange={setPhase}
        />
      </main>
    );
  }
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
  rentCandidate,
  providerLaunchMessage,
  providerLaunchFailedUrl = null,
  onProviderLaunch,
  onToggleTrailer,
  playbackAutofocus = true,
  tonight = false,
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
  const launchFailed = (url) =>
    Boolean(providerLaunchMessage) && isFailedLaunchUrl(providerLaunchFailedUrl, url);
  const canLaunch = canOfferLaunch && !launchFailed(webLaunchCandidate.url);
  // Only when there is nothing of yours to open, and only a store's own title
  // page: the TV has no browser to show a list of stores in.
  const offersRent = showWhereToWatch && !canOfferLaunch && rentCandidate?.linkType === "rent";
  const canRent = offersRent && !launchFailed(rentCandidate.url);

  if (tonight) {
    return (
      <TvTonightPick
        movie={movie}
        year={year}
        facts={[runtimeLabel, ...genres.slice(0, 3)].filter(Boolean)}
        releaseStatus={releaseStatus}
        providerNames={movie.streamingProviders || []}
        providerLogos={providerLogos}
        availability={availability}
        showWhereToWatch={showWhereToWatch}
        hasStructuredAvailability={hasStructuredAvailability}
        webLaunchCandidate={webLaunchCandidate}
        canOfferLaunch={canOfferLaunch}
        canLaunch={canLaunch}
        rentCandidate={rentCandidate}
        offersRent={offersRent}
        canRent={canRent}
        providerLaunchMessage={providerLaunchMessage}
        onProviderLaunch={onProviderLaunch}
        onToggleTrailer={onToggleTrailer}
        playbackAutofocus={playbackAutofocus}
      >
        {children}
      </TvTonightPick>
    );
  }

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

        {showWhereToWatch && hasTransactionalAvailability && !offersRent && (
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
          {/* Never focused first and never auto-started: spending money is the
              one press the room should have to go looking for. */}
          {canRent && (
            <a
              className="tv-button tv-button-secondary"
              data-tv-focusable
              data-tv-nav-group="reveal-actions"
              data-tv-no-initial-focus="true"
              href={rentCandidate.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onProviderLaunch}
            >
              <ServiceLogo service={rentCandidate.storeName} className="tv-launch-logo" />
              Rent on {rentCandidate.storeName}
            </a>
          )}
          {offersRent && !canRent && (
            <button
              type="button"
              className="tv-button tv-button-secondary"
              data-tv-focusable
              data-tv-nav-group="reveal-actions"
              disabled
            >
              <ServiceLogo service={rentCandidate.storeName} className="tv-launch-logo" />
              Rent on {rentCandidate.storeName}
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

        {showWhereToWatch && (webLaunchCandidate?.linkType === "title" || offersRent) && (
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

// Prototype switch for the mockup only.
const TRAILER_PLACEMENT = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("trailer") === "label" ? "label" : "poster";

const PLAY_ICON = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 4.5v15l12-7.5z" />
  </svg>
);

// The drawn movie as the phone's tonight sheet shows it, at television size.
// Nothing on it is a label: the slip is why it was in the bowl, the one big
// button is what to do next, the play button is the trailer, and the logos are
// where else it is. The television has no browser to unfold those logos into a
// list, so they are a glance rather than a control.
function TvTonightPick({
  movie,
  year,
  facts,
  releaseStatus,
  providerNames,
  providerLogos,
  availability,
  showWhereToWatch,
  hasStructuredAvailability,
  webLaunchCandidate,
  canOfferLaunch,
  canLaunch,
  rentCandidate,
  offersRent,
  canRent,
  providerLaunchMessage,
  onProviderLaunch,
  onToggleTrailer,
  playbackAutofocus,
  children,
}) {
  const trailer = movie.trailer;
  const author = isStarterPackMovie(movie) ? null : getMovieAttributionLabel(movie);
  const authorInitial = String(author || "").trim().charAt(0).toUpperCase();
  const primaryStore = offersRent ? rentCandidate.storeName : null;
  const otherLogos = [];
  const seen = new Set([webLaunchCandidate?.serviceName, primaryStore].filter(Boolean));
  if (showWhereToWatch) {
    providerNames.forEach((name) => {
      if (seen.has(name)) return;
      seen.add(name);
      otherLogos.push({ name, url: getProviderLogoUrl(providerLogos[name], "w92") });
    });
    ["rent", "buy"].forEach((group) => {
      (availability[group] || []).forEach((provider) => {
        const name = normalizeRentalStore(provider.name) || provider.name;
        if (seen.has(name)) return;
        seen.add(name);
        otherLogos.push({ name, url: getProviderLogoUrl(provider.logoPath, "w92") });
      });
    });
  }
  const shownLogos = otherLogos.filter((logo) => logo.url).slice(0, 4);
  const hiddenLogoCount = otherLogos.length - shownLogos.length;

  const primary = canOfferLaunch
    ? { url: webLaunchCandidate.url, service: webLaunchCandidate.serviceName, label: `Watch on ${webLaunchCandidate.serviceName}`, enabled: canLaunch, autofocus: playbackAutofocus }
    : offersRent
      // Never focused first: spending money is the one press the room should
      // have to go looking for.
      ? { url: rentCandidate.url, service: rentCandidate.storeName, label: `Rent on ${rentCandidate.storeName}`, enabled: canRent, autofocus: false }
      : null;

  return (
    <section className="tv-reveal is-kept is-tonight">
      <div className="tv-poster-wrap">
        <img
          className="tv-reveal-poster"
          src={getPosterUrl(movie, "w500")}
          alt={`${movie.title} poster`}
        />
        {/* Where a video player puts it: the play button on the picture. */}
        {trailer?.embedUrl && TRAILER_PLACEMENT === "poster" && (
          <button
            type="button"
            className="tv-poster-play"
            aria-label="Watch trailer"
            data-tv-focusable
            data-tv-autofocus={playbackAutofocus && !canLaunch ? "true" : undefined}
            onClick={onToggleTrailer}
          >
            {PLAY_ICON}
          </button>
        )}
      </div>

      <div className="tv-reveal-copy">
        <h1>
          {movie.title}
          {year && <span> ({year})</span>}
        </h1>

        {facts.length > 0 && <p className="tv-movie-facts">{facts.join(" • ")}</p>}

        {releaseStatus.isExceptional && releaseStatus.label && (
          <p className={`tv-release-status${releaseStatus.state === "canceled" ? " is-canceled" : ""}`}>
            {releaseStatus.label}
          </p>
        )}

        {movie.overview && <p className="tv-overview">{movie.overview}</p>}

        {movie.note && (
          <figure className="tv-tonight-slip">
            {authorInitial && <span className="tv-tonight-slip-avatar" aria-hidden="true">{authorInitial}</span>}
            <blockquote>{movie.note}</blockquote>
            {author && <figcaption className="sr-only">From {author}</figcaption>}
          </figure>
        )}

        <div className="tv-reveal-actions tv-tonight-actions">
          {primary && primary.enabled && (
            <a
              className="tv-button tv-button-primary tv-tonight-primary"
              data-tv-focusable
              data-tv-nav-group="reveal-actions"
              data-tv-autofocus={primary.autofocus ? "true" : undefined}
              data-tv-no-initial-focus={primary.autofocus ? undefined : "true"}
              href={primary.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onProviderLaunch}
            >
              <ServiceLogo service={primary.service} className="tv-launch-logo" />
              {primary.label}
            </a>
          )}
          {primary && !primary.enabled && (
            <button
              type="button"
              className="tv-button tv-button-primary tv-tonight-primary"
              data-tv-focusable
              data-tv-nav-group="reveal-actions"
              disabled
            >
              <ServiceLogo service={primary.service} className="tv-launch-logo" />
              {primary.label}
            </button>
          )}
          {trailer?.embedUrl && TRAILER_PLACEMENT === "label" && (
            <button
              type="button"
              className="tv-button tv-button-secondary tv-trailer-button"
              data-tv-focusable
              data-tv-nav-group="reveal-actions"
              data-tv-autofocus={playbackAutofocus && !canLaunch ? "true" : undefined}
              onClick={onToggleTrailer}
            >
              {PLAY_ICON}
              Trailer
            </button>
          )}
          {otherLogos.length > 0 && (
            <span
              className="tv-tonight-logos"
              role="img"
              aria-label={`Also on ${otherLogos.map((logo) => logo.name).join(", ")}`}
            >
              {shownLogos.map((logo) => <img key={logo.name} src={logo.url} alt="" />)}
              {hiddenLogoCount > 0 && <span>+{hiddenLogoCount}</span>}
            </span>
          )}
        </div>

        {showWhereToWatch && (webLaunchCandidate?.linkType === "title" || offersRent) && (
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

// Decorative, so a title without a still (custom slips, or TMDB never had one)
// simply keeps the plain page, and one that fails to load hides itself.
export function TvRevealBackdrop({ movie }) {
  const backdropUrl = getBackdropUrl(movie);
  if (!backdropUrl) return null;

  return (
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
  rentCandidate,
  providerLaunchMessage,
  providerLaunchFailedUrl,
  onProviderLaunch,
  onCloseTrailer,
  onToggleTrailer,
  kicker = "Decision made",
  badgeLabel = "Tonight's pick",
  noteLabel = "Why it’s in the bowl",
  historyMetadata = [],
  tonight = true,
}) {
  const trailer = movie.trailer;
  const isCoveredByOverlay = isDialogOpen || showTrailer;

  return (
    <>
      <main
        className="tv-page tv-reveal-page is-kept"
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
          streamingServices={streamingServices}
          kicker={kicker}
          badgeLabel={badgeLabel}
          noteLabel={noteLabel}
          historyMetadata={historyMetadata}
          webLaunchCandidate={webLaunchCandidate}
          rentCandidate={rentCandidate}
          providerLaunchMessage={providerLaunchMessage}
          providerLaunchFailedUrl={providerLaunchFailedUrl}
          onProviderLaunch={onProviderLaunch}
          onToggleTrailer={onToggleTrailer}
          tonight={tonight}
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
