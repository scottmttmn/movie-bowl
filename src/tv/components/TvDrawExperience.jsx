import { useState } from "react";
import BowlIllustration from "../../components/BowlIllustration";
import DrawRevealStage from "../../components/DrawRevealStage";
import { getDrawMethod } from "../../utils/drawMethods";
import { getDrawRevealAnnouncement } from "../../utils/drawReveal";
import ProviderLinksAttribution from "../../components/ProviderLinksAttribution";
import AvailabilityAttribution from "../../components/AvailabilityAttribution";
import { getServiceLogoPath } from "../../utils/providerLogos";
import { getBackdropUrl } from "../../utils/getBackdropUrl";
import { getPosterUrl } from "../../utils/getPosterUrl";
import { getProviderLogoUrl } from "../../utils/getProviderLogoUrl";
import { getMovieAttributionLabel, isStarterPackMovie } from "../../utils/drawBuckets";
import { getMovieReleaseStatus } from "../../utils/movieReleaseStatus";
import { normalizeRentalStore } from "../../utils/rentalStores";
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
          {bowlName}. {revealRun.drawnBy ? `Drawn by ${revealRun.drawnBy}. ` : ""}{announcement || heading}
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
          drawnBy={revealRun.drawnBy || ""}
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
  showWhereToWatch = true,
  webLaunchCandidate,
  rentCandidate,
  providerLaunchMessage,
  providerLaunchFailedUrl = null,
  onProviderLaunch,
  onToggleTrailer,
  playbackAutofocus = true,
  noteAuthor = null,
  watchedOn = null,
  extraActions = null,
  children,
}) {
  const year = getYear(movie);
  const genres = getGenreNames(movie);
  const providerLogos = movie.streamingProviderLogos || {};
  const runtimeLabel = movie.runtime ? `${movie.runtime} min` : null;
  const releaseStatus = movie.releaseStatus || getMovieReleaseStatus(movie);
  const availability = movie.streamingAvailability || {};
  const hasStructuredAvailability = ["subscription", "free", "ads", "rent", "buy"]
    .some((group) => Array.isArray(availability[group]) && availability[group].length > 0);
  const canOfferLaunch = showWhereToWatch && Boolean(webLaunchCandidate?.url);
  const launchFailed = (url) =>
    Boolean(providerLaunchMessage) && isFailedLaunchUrl(providerLaunchFailedUrl, url);
  const canLaunch = canOfferLaunch && !launchFailed(webLaunchCandidate.url);
  // Only when there is nothing of yours to open, and only a store's own title
  // page: the TV has no browser to show a list of stores in.
  const offersRent = showWhereToWatch && !canOfferLaunch && rentCandidate?.linkType === "rent";
  const canRent = offersRent && !launchFailed(rentCandidate.url);

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
      noteAuthor={noteAuthor}
      watchedOn={watchedOn}
      extraActions={extraActions}
    >
      {children}
    </TvTonightPick>
  );
}

const PLAY_ICON = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 4.5v15l12-7.5z" />
  </svg>
);

const CHECK_ICON = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

// The drawn movie as the phone's tonight sheet shows it, at television size:
// the slip is why it was in the bowl, the one big button is what to do next,
// and the logos are where else it is. The trailer keeps its word, because a
// bare play button beside the title reads as playing the film itself. The television has no browser to unfold those logos into a
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
  noteAuthor,
  watchedOn,
  extraActions,
  children,
}) {
  const [loadedLogoUrl, setLoadedLogoUrl] = useState(null);
  const [failedLogoUrl, setFailedLogoUrl] = useState(null);
  const trailer = movie.trailer;
  const author = noteAuthor || (isStarterPackMovie(movie) ? null : getMovieAttributionLabel(movie));
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
      // Pressing it only opens the store's page, where buying takes another
      // confirmation, so it is the next step like any other. The $ on its logo
      // is what says this one costs money.
      ? { url: rentCandidate.url, service: rentCandidate.storeName, label: `Rent on ${rentCandidate.storeName}`, enabled: canRent, autofocus: playbackAutofocus, rent: true }
      : null;
  // A store is not a streaming service, so its logo comes from the title's
  // own rent listing, as on the phone. Without one the $ stands alone.
  const rentLogoUrl = primary?.rent
    ? getProviderLogoUrl(
      (availability.rent || []).find((provider) => normalizeRentalStore(provider.name) === primary.service)?.logoPath,
      "w92"
    )
    : null;
  const primaryLogoUrl = primary?.rent
    ? rentLogoUrl
    : primary ? getProviderLogoUrl(getServiceLogoPath(primary.service), "w92") : null;
  // The logo names the service, so beside it the button says only what
  // pressing it does. Until the logo has actually loaded, and for good if it
  // fails, the button keeps the name; the full sentence is always the
  // accessible name.
  const logoShown = Boolean(primaryLogoUrl) && loadedLogoUrl === primaryLogoUrl;
  const primaryText = primary && logoShown ? (primary.rent ? "Rent" : "Watch") : primary?.label;
  const logoImage = primaryLogoUrl && failedLogoUrl !== primaryLogoUrl && (
    <img
      className="tv-launch-logo tv-launch-logo-plate"
      src={primaryLogoUrl}
      alt=""
      onLoad={() => setLoadedLogoUrl(primaryLogoUrl)}
      onError={() => setFailedLogoUrl(primaryLogoUrl)}
    />
  );
  const primaryLogo = !primary ? null : !primary.rent ? logoImage : (
    <span className={`tv-launch-logo-wrap${logoImage ? "" : " is-bare"}`}>
      {logoImage}
      <span className="tv-rent-mark" aria-hidden="true">$</span>
    </span>
  );

  return (
    <section className="tv-reveal is-kept is-tonight">
      <div className="tv-poster-wrap">
        <img
          className="tv-reveal-poster"
          src={getPosterUrl(movie, "w500")}
          alt={`${movie.title} poster`}
        />
      </div>

      <div className="tv-reveal-copy">
        <h1>
          {movie.title}
          {year && <span> ({year})</span>}
        </h1>

        {facts.length > 0 && <p className="tv-movie-facts">{facts.join(" • ")}</p>}

        {watchedOn && (
          <p className="tv-watched-on">
            {CHECK_ICON}
            Watched {watchedOn}
          </p>
        )}

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
              aria-label={primary.label}
              href={primary.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onProviderLaunch}
            >
              {primaryLogo}
              {primaryText}
            </a>
          )}
          {primary && !primary.enabled && (
            <button
              type="button"
              className="tv-button tv-button-primary tv-tonight-primary"
              data-tv-focusable
              data-tv-nav-group="reveal-actions"
              aria-label={primary.label}
              disabled
            >
              {primaryLogo}
              {primaryText}
            </button>
          )}
          {trailer?.embedUrl && (
            <button
              type="button"
              className="tv-button tv-button-secondary tv-trailer-button"
              data-tv-focusable
              data-tv-nav-group="reveal-actions"
              data-tv-autofocus={playbackAutofocus && !primary?.enabled ? "true" : undefined}
              onClick={onToggleTrailer}
            >
              {PLAY_ICON}
              Trailer
            </button>
          )}
          {extraActions}
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
  // Who wrote the slip, when the movie row cannot say: a solo pick is always
  // the viewer's own, and its row carries no profile to name them by.
  noteAuthor = null,
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
          webLaunchCandidate={webLaunchCandidate}
          rentCandidate={rentCandidate}
          providerLaunchMessage={providerLaunchMessage}
          providerLaunchFailedUrl={providerLaunchFailedUrl}
          onProviderLaunch={onProviderLaunch}
          onToggleTrailer={onToggleTrailer}
          noteAuthor={noteAuthor}
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
