import React, { useEffect, useRef, useState } from "react";
import MovieSearch from "./MovieSearch";
import { getPosterUrl } from "../utils/getPosterUrl";
import { getProviderLogoUrl } from "../utils/getProviderLogoUrl";
import { matchUserServices, normalizeStreamingServices } from "../utils/streamingServices";
import { normalizeRentalStore } from "../utils/rentalStores";
import ProviderLinksAttribution from "./ProviderLinksAttribution";
import AvailabilityAttribution from "./AvailabilityAttribution";
import MoviePosterPin from "./MoviePosterPin";
import ServiceLogo from "./ServiceLogo";
import TrailerEmbed from "./TrailerEmbed";
import PersonalCommentSection from "./PersonalCommentSection";
import { getMovieAttributionLabel, isStarterPackMovie } from "../utils/drawBuckets";
import { getMovieReleaseStatus } from "../utils/movieReleaseStatus";
import {
  MAX_MOVIE_NOTE_LENGTH,
  getMovieNoteValidationError,
  normalizeMovieNote,
} from "../utils/movieNote";

const AVAILABILITY_GROUPS = [
  { key: "subscription", label: "Included with subscription", eligible: true },
  { key: "free", label: "Free", eligible: true },
  { key: "ads", label: "Free with ads", eligible: true },
  { key: "rent", label: "Rent", eligible: false },
  { key: "buy", label: "Buy", eligible: false },
];

function ProviderPills({ providers, providerLogos, userStreamingServices, eligible }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {providers.map((provider) => {
        const [normalizedName] = normalizeStreamingServices([provider.name]);
        const isMatch = eligible && matchUserServices(
          [provider.name],
          userStreamingServices
        ).length > 0;
        const logoUrl = getProviderLogoUrl(
          provider.logoPath || providerLogos[normalizedName]
        );

        return (
          <li
            key={provider.id ? `${provider.id}:${provider.name}` : provider.name}
            className={`flex items-center gap-2 rounded-lg border py-1.5 text-sm ${logoUrl ? "pl-1.5 pr-3" : "px-3"} ${isMatch ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300" : "border-slate-700/70 text-slate-300"}`}
          >
            {isMatch && <span aria-hidden="true" className="ml-1">✓</span>}
            {logoUrl && (
              <img src={logoUrl} alt="" className="h-7 w-7 rounded-md" loading="lazy" />
            )}
            <span>{provider.name}</span>
            {isMatch && <span className="sr-only"> (in your services)</span>}
          </li>
        );
      })}
    </ul>
  );
}

// "Max", "Max and Hulu", "Max, Hulu and Peacock", then "Max, Hulu and 3 more".
function describeProviderNames(names) {
  if (names.length <= 1) return names[0] || "";
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

function uniqueProvidersByName(providers) {
  const seen = new Set();
  return providers.filter((provider) => {
    const [key] = normalizeStreamingServices([provider.name]);
    if (!key || seen.has(key.toLowerCase())) return false;
    seen.add(key.toLowerCase());
    return true;
  });
}

// A folded row of provider groups. The list stays mounted and hidden, so the
// button's aria-controls always names something that exists.
function ProviderDisclosure({ id, label, isOpen, onToggle, groups, providerLogos, userStreamingServices }) {
  return (
    <div className="border-t border-slate-700/60">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm text-slate-300 hover:text-slate-100"
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={onToggle}
      >
        <span>{label}</span>
        <span aria-hidden="true" className="text-slate-400">{isOpen ? "▾" : "▸"}</span>
      </button>
      <div id={id} hidden={!isOpen} className="space-y-3 pb-3">
        {groups.map((group) => (
          <div key={group.key}>
            {groups.length > 1 && (
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                {group.label}
              </h4>
            )}
            <ProviderPills
              providers={group.providers}
              providerLogos={providerLogos}
              userStreamingServices={userStreamingServices}
              eligible={group.eligible}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// The same contract as an effect dependency array, read during render instead
// of after the commit. See the resets it guards for why that matters.
function useChangedDeps(deps) {
  const [seen, setSeen] = useState(deps);
  const changed = deps.some((value, index) => !Object.is(value, seen[index]));
  if (changed) setSeen(deps);
  return changed;
}

function formatDisplayDate(value) {
  if (!value) return null;

  const dateOnly = String(value).match(/^\d{4}-\d{2}-\d{2}$/);
  const date = dateOnly ? new Date(`${dateOnly[0]}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

export default function AddMovieModal({
  movie,
  inline = false,
  inlineBackLabel = "Back to search",
  onClose,
  onAddMovie,
  userStreamingServices = [],
  showWhereToWatch = true,
  detailPrimaryActionLabel = null,
  detailPrimaryActionNote = null,
  detailPrimaryActionFields = null,
  onDetailPrimaryAction = null,
  detailPrimaryActionError = "",
  isDetailPrimaryActionLoading = false,
  isDetailPrimaryActionDisabled = false,
  webLaunchCandidate = null,
  rentCandidate = null,
  onEditNote = null,
  onDeleteMovie = null,
  deleteActionLabel = "Delete",
  deleteActionAriaLabel = null,
  noteHeading = null,
  noteCollapsed = false,
  personalComment = null,
  onTogglePin = null,
  pinDisabledReason = "",
  isObscured = false,
  tonight = null,
}) {
  const [displayedNote, setDisplayedNote] = useState(() => normalizeMovieNote(movie?.note));
  const [noteDraft, setNoteDraft] = useState(() => movie?.note || "");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteEditError, setNoteEditError] = useState("");
  const [isNoteOpen, setIsNoteOpen] = useState(!noteCollapsed);
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [pinError, setPinError] = useState("");
  const [isTrailerVisible, setIsTrailerVisible] = useState(false);
  const [isOtherStreamingOpen, setIsOtherStreamingOpen] = useState(false);
  const [isStoresOpen, setIsStoresOpen] = useState(false);
  const [failedPosterUrl, setFailedPosterUrl] = useState(null);
  const [isWhereOpen, setIsWhereOpen] = useState(false);
  const backButton = useRef(null);

  useEffect(() => {
    if (inline) backButton.current?.focus();
  }, [inline]);

  useEffect(() => {
    // Covered by the pre-roll, Escape belongs to the overlay on top. Checking
    // defaultPrevented alone depends on which listener was attached last, and
    // the pre-roll re-attaches its own whenever its state changes.
    if (inline || isObscured) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, inline, isObscured]);

  // These resets belong to the movie, not to the mount. As effects they ran
  // after the pane was already on screen and tappable, so a trailer opened --
  // or a comment begun -- in that first instant was undone a moment later by a
  // reset meant only for a movie that had changed. Adjusting during render puts
  // them back in front of the first paint, where nothing can be lost to them.
  const noteChanged = useChangedDeps([movie?.id, movie?.note]);
  const pinStateChanged = useChangedDeps([movie?.id, movie?.is_pinned]);
  const trailerSubjectChanged = useChangedDeps([movie?.id, movie?.tmdb_id]);

  if (noteChanged) {
    setIsNoteOpen(!noteCollapsed);
    setDisplayedNote(normalizeMovieNote(movie?.note));
    setNoteDraft(movie?.note || "");
    setIsEditingNote(false);
    setIsSavingNote(false);
    setNoteEditError("");
  }

  if (pinStateChanged) {
    setPinError("");
  }

  if (trailerSubjectChanged) {
    setIsTrailerVisible(false);
    setIsOtherStreamingOpen(false);
    setIsStoresOpen(false);
    setIsWhereOpen(false);
  }

  // This modal is used in two contexts:
  // 1) "Add movie" flow (movie is undefined): show search UI.
  // 2) "Just drawn" flow (movie is defined): show details for the drawn movie.
  if (!movie) {
    return (
      <div
        className="modal-overlay z-50"
        role="presentation"
        aria-hidden={isObscured ? "true" : undefined}
        inert={isObscured}
      >
        <div className="modal-surface max-h-[92vh] max-w-4xl overflow-y-auto p-5 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="movie-search-title">
          <button
            onClick={onClose}
            className="icon-btn absolute top-4 right-4"
            aria-label="Close"
          >
            ✕
          </button>

          <h2 id="movie-search-title" className="mb-4 pr-12 text-2xl font-semibold tracking-tight text-slate-100">Search Movies</h2>

          {/* MovieSearch handles TMDB search + details fetch and returns a full movie object */}
          <MovieSearch
            userStreamingServices={userStreamingServices}
            onAddMovie={async (selectedMovie) => {
              // Parent is responsible for persisting to Supabase.
              if (onAddMovie) {
                return onAddMovie(selectedMovie);
              }
              return { ok: false, message: "Could not add this movie. Please try again." };
            }}
            onClose={onClose}
          />
        </div>
      </div>
    );
  }

  // Compute poster URL in the UI so we can store raw TMDB poster_path in the DB.
  const posterUrl = movie.poster_path ? getPosterUrl(movie, "w500") : movie.poster || null;

  const year = movie.release_date
    ? movie.release_date.split("-")[0]
    : null;
  const resolvedMovieId = movie.tmdb_id ?? movie.id ?? null;
  const isCustomEntry = Boolean(
    movie.isCustomEntry || resolvedMovieId == null || Number(resolvedMovieId) <= 0
  );
  const watchedAt = movie.watched_on || movie.drawn_at || movie.drawnAt || null;
  const watchedDateLabel = formatDisplayDate(watchedAt);
  const addedByLabel = getMovieAttributionLabel(movie);
  const availableProviders = normalizeStreamingServices(movie.streamingProviders || []);
  const providerLogos = movie.streamingProviderLogos || {};
  const availability = movie.streamingAvailability || {};
  const availabilityGroups = AVAILABILITY_GROUPS.map((group) => ({
    ...group,
    providers: Array.isArray(availability[group.key]) ? availability[group.key] : [],
  })).filter((group) => group.providers.length > 0);
  const hasStructuredAvailability = availabilityGroups.length > 0;
  // Only the viewer's own services are shown open. Every other way to stream
  // it, and every store, folds into a row that says how many there are: a
  // title is often on twenty services at once, and the list buried the one
  // answer people open this for.
  const streamingGroups = hasStructuredAvailability
    ? availabilityGroups.filter((group) => group.eligible)
    : availableProviders.length > 0
      ? [{ key: "subscription", label: "Streaming", eligible: true, providers: availableProviders.map((name) => ({ name })) }]
      : [];
  const storeGroups = availabilityGroups.filter((group) => !group.eligible);
  const isUserService = (name) => matchUserServices([name], userStreamingServices).length > 0;
  const userServiceProviders = uniqueProvidersByName(
    streamingGroups.flatMap((group) => group.providers).filter((provider) => isUserService(provider.name))
  );
  const otherStreamingGroups = streamingGroups
    .map((group) => ({ ...group, providers: group.providers.filter((provider) => !isUserService(provider.name)) }))
    .filter((group) => group.providers.length > 0);
  const otherStreamingNames = normalizeStreamingServices(
    otherStreamingGroups.flatMap((group) => group.providers.map((provider) => provider.name))
  );
  const storeCount = new Set(
    storeGroups.flatMap((group) => group.providers.map((provider) => provider.name.toLowerCase()))
  ).size;
  const hasAnyAvailability = streamingGroups.length > 0 || storeGroups.length > 0;
  const launchButton = webLaunchCandidate ? (
    <div>
      {/* Native links avoid mistaking a secure window.open result for a blocked popup. */}
      <a href={webLaunchCandidate.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary w-full text-sm sm:w-auto">
        <ServiceLogo service={webLaunchCandidate.serviceName} className="h-5 w-5" />
        {`Open on Web in ${webLaunchCandidate.serviceName}`}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      {webLaunchCandidate.linkType === "title" && <div className="mt-2"><ProviderLinksAttribution /></div>}
    </div>
  ) : null;
  const rentStoreLogoUrl = rentCandidate?.storeName
    ? getProviderLogoUrl(
      (Array.isArray(availability.rent) ? availability.rent : [])
        .find((provider) => normalizeRentalStore(provider.name) === rentCandidate.storeName)?.logoPath
    )
    : null;
  const rentButton = rentCandidate ? (
    <div>
      <a href={rentCandidate.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary w-full text-sm sm:w-auto">
        {rentStoreLogoUrl && <img src={rentStoreLogoUrl} alt="" className="h-5 w-5 rounded" loading="lazy" />}
        {rentCandidate.linkType === "rent" ? `Rent on ${rentCandidate.storeName}` : "See rent options"}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      {rentCandidate.linkType === "rent" && <div className="mt-2"><ProviderLinksAttribution /></div>}
    </div>
  ) : null;
  const providerStatus = movie.streamingProviderStatus || "ready";
  const releaseStatus = movie.releaseStatus || getMovieReleaseStatus(movie);
  const hasTrailer = movie?.trailer?.site === "YouTube" && Boolean(movie?.trailer?.key);
  const trailerRegionId = resolvedMovieId != null
    ? `movie-trailer-${String(resolvedMovieId).replace(/[^a-zA-Z0-9_-]+/g, "-")}`
    : "movie-trailer";
  const resolvedNoteHeading = noteHeading || "Why it’s in the bowl";

  // The drawn movie, as tonight's pick rather than a lookup. Everything it
  // says is shown, not written: the contributor's slip for the why, one
  // button for the next step.
  const tonightSlipNote = tonight && !isEditingNote ? displayedNote : null;
  const contributorInitial = (addedByLabel || "").trim().charAt(0).toUpperCase();
  const tonightPrimary = !tonight
    ? null
    : webLaunchCandidate
      ? {
        url: webLaunchCandidate.url,
        label: `Watch on ${webLaunchCandidate.serviceName}`,
        logo: <ServiceLogo service={webLaunchCandidate.serviceName} className="h-5 w-5" />,
        linksAttribution: webLaunchCandidate.linkType === "title",
      }
      : rentCandidate
        ? {
          url: rentCandidate.url,
          label: rentCandidate.linkType === "rent" ? `Rent on ${rentCandidate.storeName}` : "See rent options",
          logo: rentStoreLogoUrl ? <img src={rentStoreLogoUrl} alt="" className="h-5 w-5 rounded" loading="lazy" /> : null,
          linksAttribution: rentCandidate.linkType === "rent",
        }
        : null;
  const tonightProviders = tonight
    ? uniqueProvidersByName([...streamingGroups, ...storeGroups].flatMap((group) => group.providers))
      .filter((provider) => normalizeStreamingServices([provider.name])[0] !== webLaunchCandidate?.serviceName)
    : [];
  const tonightProviderLogos = tonightProviders
    .map((provider) => getProviderLogoUrl(provider.logoPath || providerLogos[normalizeStreamingServices([provider.name])[0]]))
    .filter(Boolean)
    .slice(0, 3);
  const showWhereSection = showWhereToWatch && (!tonight || isWhereOpen);

  const personalCommentSection = personalComment ? (
    <PersonalCommentSection
      key={`${resolvedMovieId ?? ""}:${personalComment.entryId ?? ""}`}
      note={personalComment.note}
      onSave={personalComment.onSave}
      collapsed={Boolean(personalComment.collapsed)}
    />
  ) : null;

  const saveNote = async () => {
    if (!onEditNote || isSavingNote) return;

    const validationError = getMovieNoteValidationError(noteDraft);
    if (validationError) {
      setNoteEditError(validationError);
      return;
    }

    setIsSavingNote(true);
    setNoteEditError("");
    try {
      const result = await onEditNote(noteDraft);
      if (result === false || result?.ok === false) {
        setNoteEditError(result?.message || "Could not save this comment. Please try again.");
        return;
      }

      const nextNote = normalizeMovieNote(result?.movie?.note ?? noteDraft);
      setDisplayedNote(nextNote);
      setNoteDraft(nextNote || "");
      setIsEditingNote(false);
    } catch (error) {
      console.error("[AddMovieModal] Failed to save movie comment", error);
      setNoteEditError("Could not save this comment. Please try again.");
    } finally {
      setIsSavingNote(false);
    }
  };

  const togglePin = async () => {
    if (!onTogglePin || pinDisabledReason || isSavingPin) return;
    setIsSavingPin(true);
    setPinError("");
    try {
      const result = await onTogglePin(!movie.is_pinned);
      if (result === false || result?.ok === false) {
        setPinError(result?.message || "Could not update this pin. Please try again.");
      }
    } catch {
      setPinError("Could not update this pin. Please try again.");
    } finally {
      setIsSavingPin(false);
    }
  };

  return (
    // Something is stacked on top of this modal -- the theater pre-roll plays
    // over the reveal rather than replacing it. aria-hidden takes it out of the
    // accessibility tree, and inert takes its controls out of the focus order,
    // which is the half that matters: without it a stray Enter during previews
    // can still reach "Open on Web in [service]" behind the overlay.
    <div
      className={inline ? "bowl-add-inline-details" : "modal-overlay z-50"}
      role={inline ? undefined : "presentation"}
      aria-hidden={isObscured ? "true" : undefined}
      inert={isObscured}
    >
      <div className={inline ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "modal-surface flex max-h-[92dvh] max-w-3xl flex-col overflow-clip"} role={inline ? undefined : "dialog"} aria-modal={inline ? undefined : "true"} aria-labelledby="movie-detail-title">
        <div className={inline ? "mb-3 shrink-0" : "flex shrink-0 items-center justify-between gap-4 px-5 py-3 sm:px-7 sm:py-4"}>
          {/* Tonight's pick needs no heading: the reveal just said what it is. */}
          {!inline && (tonight ? <span aria-hidden="true" /> : <p className="eyebrow">Movie details</p>)}
          <button ref={backButton} type="button" onClick={onClose} className={inline ? "btn btn-ghost whitespace-nowrap px-0 text-sm" : "icon-btn shrink-0"} aria-label={inline ? inlineBackLabel : "Close"}>{inline ? `← ${inlineBackLabel}` : "✕"}</button>
        </div>

        <div className={`min-h-0 space-y-6 overflow-y-auto overscroll-contain pb-6 ${inline ? "" : "px-5 sm:px-7 sm:pb-7"}`}>
          <div>
            <div className="grid grid-cols-[minmax(80px,1fr)_minmax(0,2fr)] items-start gap-4 sm:grid-cols-[176px_minmax(0,1fr)] sm:gap-6">
              <div
                className="relative"
                role={onTogglePin ? "group" : undefined}
                aria-label={onTogglePin ? "Movie pin" : undefined}
              >
                {posterUrl && failedPosterUrl !== posterUrl ? (
                  <img
                    src={posterUrl}
                    alt={movie.title}
                    className="aspect-[2/3] w-full rounded-xl object-cover shadow-lg shadow-black/30"
                    onError={() => setFailedPosterUrl(posterUrl)}
                  />
                ) : (
                  <div className="surface-card flex aspect-[2/3] flex-col items-center justify-center gap-3 p-3 text-slate-500" role="img" aria-label={`No poster for ${movie.title}`}>
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M7 3v18M17 3v18M3 8h4m-4 8h4M17 8h4m-4 8h4" />
                    </svg>
                    <span className="text-center text-xs">No poster</span>
                  </div>
                )}
                {onTogglePin && (
                  <MoviePosterPin
                    isPinned={movie.is_pinned}
                    label={isSavingPin ? "Saving pin..." : movie.is_pinned ? "Unpin movie" : "Pin movie"}
                    describedBy="movie-pin-explanation"
                    disabled={Boolean(pinDisabledReason)}
                    isSaving={isSavingPin}
                    onClick={togglePin}
                  />
                )}
              </div>

              <div className="min-w-0 py-1">
                <h2 id="movie-detail-title" className="break-words text-2xl font-semibold leading-tight tracking-tight text-slate-100 sm:text-3xl">
                  {movie.title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
                  {year && <span>{year}</span>}
                  {Number(movie.runtime) > 0 && <span>{movie.runtime} min</span>}
                  {isCustomEntry && <span className="text-xs font-medium text-amber-300">Custom</span>}
                  {releaseStatus.isExceptional && releaseStatus.label && (
                    <span className={releaseStatus.state === "canceled" ? "text-rose-300" : "text-amber-300"}>
                      {releaseStatus.label}
                    </span>
                  )}
                </div>
                {releaseStatus.milestones?.length > 0 && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    {releaseStatus.milestones.slice(0, 3).map((milestone) => milestone.label).join(" • ")}
                  </p>
                )}
                {/* A pack pick names no person, so where a name would go it
                    names the pack, in the same quiet line. The paper slip used
                    to stand here and sat in the trailer button's row. */}
                {addedByLabel && isStarterPackMovie(movie) && (
                  <p className="mt-3 break-words text-sm text-slate-400">
                    <span>From the</span>{" "}<span className="text-slate-200">{addedByLabel}</span>{" "}<span>pack</span>
                  </p>
                )}
                {tonightSlipNote && (
                  <figure className="tonight-slip mt-3">
                    {contributorInitial && <span className="tonight-slip-avatar" title={addedByLabel}>{contributorInitial}</span>}
                    <blockquote>{tonightSlipNote}</blockquote>
                    <figcaption className="sr-only">From {addedByLabel}</figcaption>
                  </figure>
                )}
                {addedByLabel && !isStarterPackMovie(movie) && !tonightSlipNote && (
                  <p className="mt-3 break-words text-sm text-slate-400">
                    <span>Added by</span>{" "}<span className="text-slate-200">{addedByLabel}</span>
                  </p>
                )}
                {watchedDateLabel && <p className="mt-2 text-sm text-slate-400">Watched on: {watchedDateLabel}</p>}
                {hasTrailer && !tonight && (
                  <button
                    type="button"
                    className="btn btn-primary mt-5 w-full px-3 text-sm sm:w-auto sm:px-5"
                    aria-expanded={isTrailerVisible}
                    aria-controls={trailerRegionId}
                    onClick={() => setIsTrailerVisible((prev) => !prev)}
                  >
                    {isTrailerVisible ? (
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 15l6-6 6 6" />
                      </svg>
                    ) : (
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
                        <path d="M8 4.5v15l12-7.5z" />
                      </svg>
                    )}
                    {isTrailerVisible ? "Hide trailer" : "Watch trailer"}
                  </button>
                )}
              </div>
            </div>
            {onTogglePin && (
              <div className="mt-3">
                <p id="movie-pin-explanation" className="text-xs leading-relaxed text-slate-400">
                  {pinDisabledReason || "One pin per bowl. Up first when you're picked, if filters match."}
                </p>
                {pinError && <p className="mt-2 text-sm text-rose-300" role="alert">{pinError}</p>}
              </div>
            )}
          </div>

          {tonight && (
            <div className="space-y-3">
              {tonightPrimary && (
                <div>
                  <a href={tonightPrimary.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full">
                    {tonightPrimary.logo}
                    {tonightPrimary.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  {tonightPrimary.linksAttribution && <div className="mt-2"><ProviderLinksAttribution /></div>}
                </div>
              )}
              {(hasTrailer || tonightProviders.length > 0) && (
                <div className="flex items-center gap-2">
                  {hasTrailer && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={isTrailerVisible ? "Hide trailer" : "Watch trailer"}
                      aria-expanded={isTrailerVisible}
                      aria-controls={trailerRegionId}
                      onClick={() => setIsTrailerVisible((prev) => !prev)}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M8 4.5v15l12-7.5z" /></svg>
                    </button>
                  )}
                  {tonightProviders.length > 0 && (
                    <button
                      type="button"
                      className="tonight-logos"
                      aria-label={`Where else to watch: ${tonightProviders.length} ${tonightProviders.length === 1 ? "option" : "options"}`}
                      aria-expanded={isWhereOpen}
                      aria-controls="movie-streaming-section"
                      onClick={() => setIsWhereOpen((open) => !open)}
                    >
                      {tonightProviderLogos.map((url) => <img key={url} src={url} alt="" loading="lazy" />)}
                      {tonightProviders.length > tonightProviderLogos.length && (
                        <span>+{tonightProviders.length - tonightProviderLogos.length}</span>
                      )}
                    </button>
                  )}
                </div>
              )}
              {/* The logos are availability data too, so they carry its credit
                  whenever the list they stand for is folded away. */}
              {tonightProviders.length > 0 && !isWhereOpen && (hasStructuredAvailability || movie.streamingWatchUrl) && (
                <AvailabilityAttribution />
              )}
            </div>
          )}

          {hasTrailer && isTrailerVisible && (
            <div id={trailerRegionId} className="surface-card aspect-video overflow-hidden">
              <TrailerEmbed
                trailer={movie.trailer}
                title={`${movie.title} trailer`}
                className="h-full w-full"
              />
            </div>
          )}

          {showWhereSection && (
            <section id="movie-streaming-section" className="border-t border-slate-700/60 pt-5" aria-labelledby="movie-streaming-title">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 id="movie-streaming-title" className="text-sm font-semibold text-slate-200">Where to watch</h3>
                {userServiceProviders.length > 0 && <p className="text-xs text-emerald-300">✓ Your services</p>}
              </div>
              {providerStatus === "failed" || !hasAnyAvailability ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">
                    {providerStatus === "failed"
                      ? "Availability could not be loaded right now. Try again later."
                      : "No US streaming providers found right now."}
                  </p>
                  {!tonight && launchButton}
                  {!tonight && rentButton}
                </div>
              ) : (
                <div className="space-y-4">
                  {userServiceProviders.length > 0 ? (
                    <ProviderPills
                      providers={userServiceProviders}
                      providerLogos={providerLogos}
                      userStreamingServices={userStreamingServices}
                      eligible
                    />
                  ) : streamingGroups.length === 0 ? (
                    <p className="text-sm text-slate-300">Not streaming on any service right now.</p>
                  ) : normalizeStreamingServices(userStreamingServices).length > 0 ? (
                    <p className="text-sm text-slate-300">Not on any of your services.</p>
                  ) : null}
                  {!tonight && launchButton}
                  {!tonight && rentButton}
                  {(otherStreamingGroups.length > 0 || storeGroups.length > 0) && (
                    <div className="border-b border-slate-700/60">
                      {otherStreamingGroups.length > 0 && (
                        <ProviderDisclosure
                          id="movie-other-streaming"
                          label={`${userServiceProviders.length > 0 ? "Also streaming" : "Streaming"} on ${describeProviderNames(otherStreamingNames)}`}
                          isOpen={isOtherStreamingOpen}
                          onToggle={() => setIsOtherStreamingOpen((open) => !open)}
                          groups={otherStreamingGroups}
                          providerLogos={providerLogos}
                          userStreamingServices={userStreamingServices}
                        />
                      )}
                      {storeGroups.length > 0 && (
                        <ProviderDisclosure
                          id="movie-rent-buy"
                          label={`Rent or buy from ${storeCount} ${storeCount === 1 ? "store" : "stores"}`}
                          isOpen={isStoresOpen}
                          onToggle={() => setIsStoresOpen((open) => !open)}
                          groups={storeGroups}
                          providerLogos={providerLogos}
                          userStreamingServices={userStreamingServices}
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
              {(hasStructuredAvailability || movie.streamingWatchUrl) && (
                <div className="mt-3"><AvailabilityAttribution /></div>
              )}
            </section>
          )}

          {/* The comment this page is about comes first; the other one follows,
              folded away. */}
          {personalComment && !personalComment.collapsed && personalCommentSection}
          {tonightSlipNote ? null : displayedNote && !isEditingNote && !isNoteOpen ? (
            <button
              type="button"
              className="btn btn-ghost -ml-3 px-3 text-sm"
              aria-expanded="false"
              onClick={() => setIsNoteOpen(true)}
            >
              {resolvedNoteHeading} <span aria-hidden="true">▸</span>
            </button>
          ) : (displayedNote || isEditingNote) ? (
            <section className="surface-card p-4" aria-labelledby="movie-note-title">
              <div className="mb-2 flex items-center justify-between gap-3">
                {noteCollapsed ? (
                  <h3 id="movie-note-title" className="text-xs font-medium text-slate-400">
                    <button
                      type="button"
                      className="-m-1 rounded p-1 hover:text-slate-200"
                      aria-expanded="true"
                      onClick={() => setIsNoteOpen(false)}
                    >
                      {resolvedNoteHeading} <span aria-hidden="true">▾</span>
                    </button>
                  </h3>
                ) : (
                  <h3 id="movie-note-title" className="text-xs font-medium text-slate-400">{resolvedNoteHeading}</h3>
                )}
                {onEditNote && !isEditingNote && (
                  <button type="button" className="btn btn-ghost -my-2 -mr-2 px-2 text-xs" aria-label="Edit Comment" onClick={() => {
                    setNoteDraft(displayedNote || "");
                    setNoteEditError("");
                    setIsEditingNote(true);
                  }}>Edit</button>
                )}
              </div>
              {isEditingNote ? (
                <div>
                  <textarea
                    className="input-field min-h-28 resize-y whitespace-pre-wrap text-sm"
                    value={noteDraft}
                    maxLength={MAX_MOVIE_NOTE_LENGTH}
                    placeholder="Recommended by Tim at dinner…"
                    onChange={(event) => setNoteDraft(event.target.value)}
                    disabled={isSavingNote}
                    aria-label="Comment (optional)"
                    aria-describedby="movie-note-help"
                    aria-invalid={Boolean(noteEditError)}
                    autoFocus
                  />
                  <div className="mt-2 flex items-start justify-between gap-3 text-xs text-slate-400">
                    <span id="movie-note-help" role={noteEditError ? "alert" : undefined}>{noteEditError || "A little context for movie night."}</span>
                    <span className="shrink-0">{noteDraft.length}/{MAX_MOVIE_NOTE_LENGTH}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary px-3 text-sm" onClick={saveNote} disabled={isSavingNote}>
                      {isSavingNote ? "Saving..." : "Save Comment"}
                    </button>
                    <button type="button" className="btn btn-ghost px-3 text-sm" disabled={isSavingNote} onClick={() => {
                      setNoteDraft(displayedNote || "");
                      setNoteEditError("");
                      setIsEditingNote(false);
                    }}>Cancel</button>
                  </div>
                </div>
              ) : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-200">{displayedNote}</p>}
            </section>
          ) : onEditNote ? (
            <button type="button" className="btn btn-ghost -ml-3 px-3 text-sm" onClick={() => {
              setNoteDraft("");
              setNoteEditError("");
              setIsEditingNote(true);
            }}>+ Add a comment</button>
          ) : null}
          {personalComment?.collapsed && personalCommentSection}
        </div>

        {(detailPrimaryActionError || detailPrimaryActionNote || onDeleteMovie || (onDetailPrimaryAction && detailPrimaryActionLabel)) && (
          <div className={`shrink-0 space-y-3 border-t border-slate-700/60 pt-4 ${inline ? "" : "px-5 pb-4 sm:px-7"}`}>
            {detailPrimaryActionFields}
            {detailPrimaryActionError && <div className="status-error text-sm" role="alert">{detailPrimaryActionError}</div>}
            {detailPrimaryActionNote && <p className="text-sm text-slate-400">{detailPrimaryActionNote}</p>}
            {(onDeleteMovie || (onDetailPrimaryAction && detailPrimaryActionLabel)) && (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                {onDeleteMovie && (
                  <button
                    type="button"
                    onClick={() => onDeleteMovie(movie)}
                    aria-label={deleteActionAriaLabel || `Delete "${movie.title}" from this bowl`}
                    className="btn btn-danger w-full sm:mr-auto sm:w-auto"
                  >
                    {deleteActionLabel}
                  </button>
                )}
                {onDetailPrimaryAction && detailPrimaryActionLabel && (
                  <button type="button" onClick={async () => { await onDetailPrimaryAction(movie); }} className="btn btn-secondary w-full sm:w-auto" disabled={isDetailPrimaryActionLoading || isDetailPrimaryActionDisabled}>
                    {isDetailPrimaryActionLoading ? "Adding..." : detailPrimaryActionLabel}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
