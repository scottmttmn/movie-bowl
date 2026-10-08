import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import useAutosave, { valuesAreEqual } from "../hooks/useAutosave";
import AutosaveStatus from "../components/AutosaveStatus";
import SettingsSectionNav from "../components/SettingsSectionNav";
import ServiceLogo from "../components/ServiceLogo";
import StreamingServiceRanking from "../components/StreamingServiceRanking";
import { RENTAL_STORES, RENT_FROM_ANY, RENT_FROM_OFF } from "../utils/rentalStores";
import { AVAILABLE_STREAMING_SERVICES } from "../utils/streamingServices";
import { deleteMyAccount } from "../lib/account";
import { DISPLAY_NAME_MAX_LENGTH } from "../utils/profileIdentity";

const MAJOR_STREAMING_SERVICES = [
  "Netflix",
  "Hulu",
  "Disney+",
  "Prime Video",
  "Max",
  "Apple TV+",
  "Paramount+",
  "Peacock",
];

// One switch row, shared by every preference on the page. The hand-rolled
// copies this replaces had drifted apart on spacing and focus treatment.
function SettingToggle({
  id,
  name,
  ariaLabel,
  label,
  description,
  note,
  checked,
  onChange,
  disabled = false,
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className={`text-base font-semibold ${disabled ? "text-slate-400" : "cursor-pointer text-slate-100"}`}
        >
          {label}
        </label>
        {description && <p className="mt-0.5 text-sm text-slate-400">{description}</p>}
        {note && <p className="mt-1 text-xs text-amber-300">{note}</p>}
      </div>
      <label htmlFor={id} className="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          id={id}
          name={name}
          aria-label={ariaLabel}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
        <span className="h-6 w-11 rounded-full bg-slate-700 transition peer-checked:bg-rose-600 peer-focus-visible:ring-2 peer-focus-visible:ring-rose-400/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-950 peer-disabled:bg-slate-800" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-slate-900 shadow transition peer-checked:translate-x-5" />
      </label>
    </div>
  );
}

// Mounted only after preferences load. Later selections must not reset the disclosure.
function ServicePicker({ initiallyOpen, children }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details
      className="group mt-4 rounded-xl border border-slate-700/70 bg-slate-900/30 p-4"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      {children}
    </details>
  );
}

export default function UserSettings() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState(null);
  const [ownedBowlBlockers, setOwnedBowlBlockers] = useState([]);
  const streamingServicesRef = useRef(null);
  const playbackRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const {
    streamingServices,
    displayName,
    accountEmail,
    setDisplayName,
    setStreamingServices,
    defaultDrawSettings,
    setDefaultDrawSettings,
    toggleService,
    loading,
    loadError,
    reloadStreamingServices,
    saveStreamingServices,
    saveDefaultDrawSettings,
    removeFromBowlsOnSoloDraw,
    setRemoveFromBowlsOnSoloDraw,
    saveRemoveFromBowlsOnSoloDraw,
    saveDisplayName,
  } = useUserStreamingServices();

  const hasServices = streamingServices.length > 0;

  const appendMissingServices = (base, additions) => {
    const next = [...base];
    additions.forEach((service) => {
      if (!next.includes(service)) next.push(service);
    });
    return next;
  };

  const filteredServices = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return AVAILABLE_STREAMING_SERVICES;

    return AVAILABLE_STREAMING_SERVICES.filter((service) =>
      service.toLowerCase().includes(query)
    );
  }, [searchTerm]);

  const streamingTileSummary = hasServices
    ? `${streamingServices.length} service${streamingServices.length === 1 ? "" : "s"} • ${streamingServices[0]} first`
    : "No services picked yet";
  const soloDrawTileSummary = removeFromBowlsOnSoloDraw
    ? "Copies leave your bowls"
    : "Copies stay in your bowls";
  const playbackTileSummary = defaultDrawSettings.theaterModeEnabled
    ? "Theater mode on"
    : "Theater mode off";
  const profileTileSummary = displayName?.trim() || "Choose a display name";

  useEffect(() => {
    if (location.hash === "#streaming-services") {
      streamingServicesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // The playback section answered to #tv-playback until it stopped being the
    // television's alone. Links to it were copyable, so honour the old one.
    if (location.hash === "#tv-playback") {
      playbackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [location.hash]);

  const settingsSnapshot = useMemo(
    () => ({
      displayName,
      streamingServices,
      defaultDrawSettings: {
        enablePreferredWebLaunch: defaultDrawSettings.enablePreferredWebLaunch,
        theaterModeEnabled: defaultDrawSettings.theaterModeEnabled,
        prerollCaptionsEnabled: defaultDrawSettings.prerollCaptionsEnabled,
        rentFrom: defaultDrawSettings.rentFrom,
      },
      removeFromBowlsOnSoloDraw,
    }),
    [displayName, streamingServices, defaultDrawSettings, removeFromBowlsOnSoloDraw]
  );

  // Only playback keys are edited here; the dashboard owns the draw filters.
  const persistSettings = useCallback(
    async (next, previous) => {
      const pendingWrites = [];

      if (!valuesAreEqual(next.displayName, previous.displayName)) {
        pendingWrites.push(saveDisplayName(next.displayName));
      }

      if (!valuesAreEqual(next.streamingServices, previous.streamingServices)) {
        pendingWrites.push(saveStreamingServices(next.streamingServices));
      }
      if (!valuesAreEqual(next.defaultDrawSettings, previous.defaultDrawSettings)) {
        pendingWrites.push(saveDefaultDrawSettings(next.defaultDrawSettings));
      }
      if (next.removeFromBowlsOnSoloDraw !== previous.removeFromBowlsOnSoloDraw) {
        pendingWrites.push(saveRemoveFromBowlsOnSoloDraw(next.removeFromBowlsOnSoloDraw));
      }

      const results = await Promise.all(pendingWrites);
      return { error: results.find((result) => result?.error)?.error || null };
    },
    [saveDisplayName, saveStreamingServices, saveDefaultDrawSettings, saveRemoveFromBowlsOnSoloDraw]
  );

  const { status: saveStatus, error: saveError, retry: retrySave } = useAutosave({
    value: settingsSnapshot,
    save: persistSettings,
    enabled: !loading && !loadError,
  });

  const closeDeleteDialog = () => {
    if (isDeletingAccount) return;
    setIsDeleteDialogOpen(false);
    setDeleteConfirmation("");
    setDeleteAccountError(null);
    setOwnedBowlBlockers([]);
  };

  // The effect below must not re-run as the dialog's own state changes: its
  // cleanup restores focus to the page behind, and both of these are fresh
  // every render.
  const closeDeleteDialogRef = useRef(closeDeleteDialog);
  useEffect(() => { closeDeleteDialogRef.current = closeDeleteDialog; });

  useEffect(() => {
    if (!isDeleteDialogOpen) return undefined;
    const dialog = deleteDialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.querySelector("#delete-account-confirm")?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        // Closing already refuses while a deletion is in flight, so Escape
        // cannot abandon a request that has gone out.
        closeDeleteDialogRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      // Read per keystroke rather than once: the owned-bowl links only appear
      // after a refused attempt, and every control disables itself while a
      // deletion is in flight.
      const controls = [...dialog.querySelectorAll("a[href], button:not(:disabled), input:not(:disabled)")];
      if (controls.length === 0) {
        // Nothing left to hold focus while the request runs. Without this, Tab
        // finds no `last` to match against and walks into the page behind.
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [isDeleteDialogOpen]);

  const handleDeleteAccount = async (event) => {
    event.preventDefault();
    if (deleteConfirmation.trim() !== "DELETE") return;

    setIsDeletingAccount(true);
    setDeleteAccountError(null);
    setOwnedBowlBlockers([]);
    const result = await deleteMyAccount();
    if (!result.ok) {
      setDeleteAccountError(result.error);
      setOwnedBowlBlockers(result.bowls || []);
      setIsDeletingAccount(false);
      return;
    }

    navigate("/login", { replace: true, state: { accountDeleted: true } });
  };

  // Show loading indicator while fetching data
  if (loading) {
    return (
      <div className="page-container py-8">
        <div className="panel text-sm text-slate-400" role="status">Loading...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page-container py-8">
        <div className="status-error flex flex-wrap items-center justify-between gap-3" role="alert">
          <p>Couldn't load your preferences. Retry before making changes.</p>
          <button type="button" className="btn btn-secondary" onClick={reloadStreamingServices}>Retry</button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container py-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <header className="page-hero mb-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">Your preferences</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">Settings</h1>
              <p className="mt-2 max-w-md text-sm text-slate-400">
                Choose your streaming services and playback preferences. Draw filters are saved from each bowl’s Filters button.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 min-[420px]:flex-row min-[420px]:items-center sm:flex-col sm:items-end">
              <AutosaveStatus status={saveStatus} />
              <button onClick={() => navigate(-1)} className="btn btn-secondary">
                Back
              </button>
            </div>
          </div>

          <SettingsSectionNav
            className="mt-6"
            items={[
              { href: "#profile", label: "Profile", value: profileTileSummary },
              { href: "#streaming-services", label: "Streaming", value: streamingTileSummary },
              { href: "#solo-draw", label: "Solo draw", value: soloDrawTileSummary },
              { href: "#playback", label: "Previews", value: playbackTileSummary },
              { href: "#account", label: "Account", value: accountEmail || "Signed in" },
            ]}
          />
        </header>

        {saveStatus === "error" && (
          <div
            role="alert"
            className="sticky bottom-4 z-20 mb-4 flex flex-col gap-3 rounded-xl border border-rose-500/60 bg-rose-950/90 px-4 py-3 text-sm text-rose-100 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-semibold">Your changes haven&apos;t been saved.</p>
              <p className="mt-0.5 text-rose-200/90">
                {saveError?.message || "Something went wrong while saving. Check your connection and try again."}
              </p>
            </div>
            <button type="button" onClick={retrySave} className="btn btn-primary shrink-0">
              Retry
            </button>
          </div>
        )}

        <div className="space-y-4">
          <section
            id="profile"
            tabIndex={-1}
            className="panel scroll-mt-24"
            aria-labelledby="profile-heading"
          >
            <h2 id="profile-heading" className="section-title">Profile</h2>
            <p className="mt-1 text-sm text-slate-400">
              This is the name people see in shared bowls. Your email stays private.
            </p>
            <div className="mt-5 max-w-md">
              <label htmlFor="display-name" className="mb-1 block text-sm font-medium text-slate-200">
                Display name
              </label>
              <input
                id="display-name"
                name="display_name"
                type="text"
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="What should people call you?"
                className="input-field"
              />
              <p className="mt-1 text-xs text-slate-500">
                Names do not need to be unique, and clearing yours shows a neutral label.
                No public profile page is created.
              </p>
            </div>
          </section>

          <section
            id="streaming-services"
            tabIndex={-1}
            ref={streamingServicesRef}
            className="panel scroll-mt-24"
            aria-labelledby="streaming-services-heading"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="streaming-services-heading" className="section-title">Streaming services</h2>
              <span className="shrink-0 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-semibold text-slate-300">
                {streamingServices.length} selected
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Rank your services in the order you prefer to watch.
            </p>

            <div className="mt-5">
              <h3 className="eyebrow">Your watch order</h3>
              {!hasServices ? (
                <p className="surface-card mt-2 px-3.5 py-3 text-sm text-slate-400">
                  Nothing picked yet. Choose services below and they will show up here in priority order.
                </p>
              ) : (
                <StreamingServiceRanking
                  services={streamingServices}
                  onReorder={setStreamingServices}
                  onRemove={toggleService}
                />
              )}
            </div>

            <ServicePicker initiallyOpen={!hasServices}>
              <summary className="cursor-pointer rounded text-sm font-semibold text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400">
                Add services
                <span className="ml-2 font-normal text-slate-400">Search or browse</span>
              </summary>
              <p className="mt-3 text-sm text-slate-400">New services go to the bottom of your order.</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="streaming-services-search"
                  name="streaming_services_search"
                  aria-label="Search streaming services"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search services..."
                  className="input-field sm:flex-1"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const next = appendMissingServices(streamingServices, AVAILABLE_STREAMING_SERVICES);
                      setStreamingServices(next);
                    }}
                    className="btn btn-ghost px-2.5 py-1 text-xs"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const existingMajorServices = streamingServices.filter((service) =>
                        MAJOR_STREAMING_SERVICES.includes(service)
                      );
                      const next = appendMissingServices(existingMajorServices, MAJOR_STREAMING_SERVICES);
                      setStreamingServices(next);
                    }}
                    className="btn btn-ghost px-2.5 py-1 text-xs"
                  >
                    Only major
                  </button>
                  <button
                    type="button"
                    onClick={() => setStreamingServices([])}
                    className="btn btn-ghost px-2.5 py-1 text-xs"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {filteredServices.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">No matching services.</p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {filteredServices.map((service) => {
                    const serviceKey = service.toLowerCase().replace(/[^a-z0-9]+/g, "_");
                    const isSelected = streamingServices.includes(service);
                    return (
                      <label
                        key={service}
                        htmlFor={`streaming-service-${serviceKey}`}
                        className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm transition focus-within:ring-2 focus-within:ring-rose-400/70 ${
                          isSelected
                            ? "border-rose-700 bg-rose-950/50 text-rose-200"
                            : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
                        }`}
                      >
                        <input
                          id={`streaming-service-${serviceKey}`}
                          name="streaming_services"
                          aria-label={service}
                          type="checkbox"
                          className="peer sr-only"
                          checked={isSelected}
                          onChange={() => toggleService(service)}
                        />
                        <span aria-hidden="true" className={isSelected ? "text-rose-300" : "text-slate-500"}>
                          {isSelected ? "✓" : "+"}
                        </span>
                        <ServiceLogo service={service} className="h-6 w-6" />
                        {service}
                      </label>
                    );
                  })}
                </div>
              )}
            </ServicePicker>

            <div className="mt-6 space-y-4 border-t border-slate-800 pt-5">
              <h3 className="eyebrow">Playback handoff</h3>
              <div className="border-t border-slate-800 pt-4">
                <SettingToggle
                  id="enable-preferred-web-launch"
                  name="enable_preferred_web_launch"
                  ariaLabel="Enable preferred web launch"
                  label="Open the service's website for a drawn movie"
                  description="Show a web launch button when a ranked service match supports direct search links."
                  note={hasServices ? "" : "Pick at least one service to turn this on."}
                  checked={defaultDrawSettings.enablePreferredWebLaunch}
                  disabled={!hasServices}
                  onChange={(event) =>
                    setDefaultDrawSettings({
                      ...defaultDrawSettings,
                      enablePreferredWebLaunch: event.target.checked,
                    })
                  }
                />
              </div>
              <div className="border-t border-slate-800 pt-4">
                <label htmlFor="rent-from" className="text-base font-semibold text-slate-100">Rent from</label>
                <p id="rent-from-help" className="mt-0.5 text-sm text-slate-400">
                  When a drawn movie isn&apos;t on any of your services, offer a button to rent it here.
                </p>
                <select
                  id="rent-from"
                  name="rent_from"
                  className="input-field mt-3 sm:max-w-xs"
                  aria-describedby="rent-from-help"
                  value={defaultDrawSettings.rentFrom}
                  onChange={(event) =>
                    setDefaultDrawSettings({
                      ...defaultDrawSettings,
                      rentFrom: event.target.value,
                    })
                  }
                >
                  <option value={RENT_FROM_ANY}>Any store</option>
                  {RENTAL_STORES.map((store) => (
                    <option key={store} value={store}>{store}</option>
                  ))}
                  <option value={RENT_FROM_OFF}>Don&apos;t offer rentals</option>
                </select>
              </div>
            </div>
          </section>

          <section id="solo-draw" tabIndex={-1} className="panel scroll-mt-24" aria-labelledby="solo-draw-heading">
            <h2 id="solo-draw-heading" className="section-title">Solo draw</h2>
            <p className="mt-1 text-sm text-slate-400">
              What happens to your copies of a movie when you draw it on your own.
            </p>

            <div className="mt-5">
              <SettingToggle
                id="remove-from-bowls-on-solo-draw"
                name="remove_from_bowls_on_solo_draw"
                ariaLabel="Remove movies from my bowls when I draw solo"
                label="Remove movies from my bowls when I draw solo"
                description="Takes your own copies of the drawn movie out of every bowl you are in, instead of leaving them for you to remove from watch history."
                note="Undo in watch history puts them back for two hours."
                checked={removeFromBowlsOnSoloDraw}
                onChange={(event) => setRemoveFromBowlsOnSoloDraw(event.target.checked)}
              />
            </div>
          </section>

          <section
            id="playback"
            ref={playbackRef}
            tabIndex={-1}
            className="panel scroll-mt-24"
            aria-labelledby="playback-heading"
          >
            <h2 id="playback-heading" className="section-title">Previews &amp; playback</h2>
            <p className="mt-1 text-sm text-slate-400">
              What plays before a drawn movie, on the television and in this app.
            </p>

            <div className="mt-5">
              <SettingToggle
                id="theater-mode-enabled"
                name="theater_mode_enabled"
                ariaLabel="Enable theater mode"
                label="Theater mode"
                description="Plays previews from other movies in the bowl before the drawn movie. It is the default for televisions; every device decides for itself from the theater mode switch beside its draw button, which is also where the number of previews is set."
                checked={defaultDrawSettings.theaterModeEnabled}
                onChange={(event) =>
                  setDefaultDrawSettings({
                    ...defaultDrawSettings,
                    theaterModeEnabled: event.target.checked,
                  })
                }
              />
            </div>
            <div className="mt-5 border-t border-slate-800 pt-5">
              <SettingToggle
                id="preroll-captions-enabled"
                name="preroll_captions_enabled"
                ariaLabel="Show captions on previews"
                label="Captions on previews"
                description="Asks YouTube to show captions on the previews before the movie, on every device. Off keeps the screen clear; a YouTube account set to always show captions still gets them."
                checked={defaultDrawSettings.prerollCaptionsEnabled}
                onChange={(event) =>
                  setDefaultDrawSettings({
                    ...defaultDrawSettings,
                    prerollCaptionsEnabled: event.target.checked,
                  })
                }
              />
            </div>
          </section>

          <section
            id="account"
            tabIndex={-1}
            className="panel scroll-mt-24"
            aria-labelledby="account-heading"
          >
            <h2 id="account-heading" className="section-title">Account</h2>
            <p className="mt-1 text-sm text-slate-400">
              Your sign-in address is visible only to you and for invitation delivery.
            </p>
            <div className="surface-card mt-4 px-3.5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email</p>
              <p className="mt-1 break-all text-sm text-slate-200">{accountEmail || "Unavailable"}</p>
            </div>

            <div className="mt-6 border-t border-rose-900/60 pt-5">
              <h3 className="text-base font-semibold text-rose-300">Delete account</h3>
              <p className="mt-1 text-sm text-slate-400">
                Permanently removes your profile, preferences, watch history, memberships, invitations, and undrawn suggestions. Completed shared bowl history remains anonymously.
              </p>
              <button
                type="button"
                className="btn btn-danger mt-3"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                Delete account
              </button>
            </div>
          </section>
        </div>
      </div>

      {isDeleteDialogOpen && (
        <div
          className="modal-overlay z-[70]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDeleteDialog();
          }}
        >
          <div
            ref={deleteDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-heading"
            className="modal-surface max-w-lg p-5 sm:p-6"
          >
            <h2 id="delete-account-heading" className="text-xl font-semibold text-slate-50">
              Permanently delete your account?
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              This cannot be undone. If you own a bowl, transfer it to another member or delete the bowl first.
            </p>

            {deleteAccountError && (
              <div role="alert" className="status-error mt-4">
                <p>{deleteAccountError}</p>
                {ownedBowlBlockers.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {ownedBowlBlockers.map((bowl) => (
                      <li key={bowl.id}>
                        <Link className="underline" to={`/bowl/${bowl.id}/settings`} onClick={closeDeleteDialog}>
                          {bowl.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <form onSubmit={handleDeleteAccount} className="mt-5">
              <label htmlFor="delete-account-confirm" className="block text-sm text-slate-300">
                Type <strong>DELETE</strong> to confirm
              </label>
              <input
                id="delete-account-confirm"
                name="delete_account_confirm"
                type="text"
                autoComplete="off"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                className="input-field mt-1"
                disabled={isDeletingAccount}
              />
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" className="btn btn-secondary" disabled={isDeletingAccount} onClick={closeDeleteDialog}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={isDeletingAccount || deleteConfirmation.trim() !== "DELETE"}
                >
                  {isDeletingAccount ? "Deleting..." : "Delete account permanently"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
