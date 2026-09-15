import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import useAutosave, { valuesAreEqual } from "../hooks/useAutosave";
import AutosaveStatus from "../components/AutosaveStatus";
import SettingsSectionNav from "../components/SettingsSectionNav";
import ServiceLogo from "../components/ServiceLogo";
import { AVAILABLE_STREAMING_SERVICES } from "../utils/streamingServices";
import {
  DEFAULT_DRAW_SETTINGS,
  THEATER_TRAILER_COUNT_OPTIONS,
} from "../utils/drawSettings";

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
  const [draggedService, setDraggedService] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const streamingServicesRef = useRef(null);
  const {
    streamingServices,
    setStreamingServices,
    defaultDrawSettings,
    setDefaultDrawSettings,
    toggleService,
    loading,
    loadError,
    reloadStreamingServices,
    saveStreamingServices,
    saveDefaultDrawSettings,
  } = useUserStreamingServices();

  const hasServices = streamingServices.length > 0;

  const appendMissingServices = (base, additions) => {
    const next = [...base];
    additions.forEach((service) => {
      if (!next.includes(service)) next.push(service);
    });
    return next;
  };

  const moveServiceToIndex = (serviceToMove, toIndex) => {
    const fromIndex = streamingServices.indexOf(serviceToMove);
    if (fromIndex === -1 || toIndex === null) return;
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= streamingServices.length) return;
    if (toIndex < 0 || toIndex > streamingServices.length) return;

    const next = [...streamingServices];
    const [moved] = next.splice(fromIndex, 1);
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    next.splice(adjustedToIndex, 0, moved);
    return next;
  };

  const moveServiceByOffset = (service, offset) => {
    const fromIndex = streamingServices.indexOf(service);
    if (fromIndex === -1) return;
    const toIndex = fromIndex + offset;
    if (toIndex < 0 || toIndex >= streamingServices.length) return;
    const next = [...streamingServices];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setStreamingServices(next);
  };

  // Where a dragged row would land, given the pointer position over a row.
  const dropIndexForPointer = (event, index) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? index : index + 1;
  };

  const commitDrop = (nextDropIndex) => {
    const next = moveServiceToIndex(draggedService, nextDropIndex);
    setDraggedService(null);
    setDropIndex(null);
    if (!next) return;
    setStreamingServices(next);
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
  const playbackTileSummary = defaultDrawSettings.theaterModeEnabled
    ? `Theater mode on • ${defaultDrawSettings.theaterTrailerCount} preview${
        defaultDrawSettings.theaterTrailerCount === 1 ? "" : "s"
      }`
    : "Theater mode off";

  useEffect(() => {
    if (location.hash !== "#streaming-services") return;
    streamingServicesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash]);

  const settingsSnapshot = useMemo(
    () => ({
      streamingServices,
      defaultDrawSettings: {
        enablePreferredWebLaunch: defaultDrawSettings.enablePreferredWebLaunch,
        theaterModeEnabled: defaultDrawSettings.theaterModeEnabled,
        theaterTrailerCount: defaultDrawSettings.theaterTrailerCount,
      },
    }),
    [streamingServices, defaultDrawSettings]
  );

  // Only playback keys are edited here; the dashboard owns the draw filters.
  const persistSettings = useCallback(
    async (next, previous) => {
      const pendingWrites = [];

      if (!valuesAreEqual(next.streamingServices, previous.streamingServices)) {
        pendingWrites.push(saveStreamingServices(next.streamingServices));
      }
      if (!valuesAreEqual(next.defaultDrawSettings, previous.defaultDrawSettings)) {
        pendingWrites.push(saveDefaultDrawSettings(next.defaultDrawSettings));
      }

      const results = await Promise.all(pendingWrites);
      return { error: results.find((result) => result?.error)?.error || null };
    },
    [saveStreamingServices, saveDefaultDrawSettings]
  );

  const { status: saveStatus, error: saveError, retry: retrySave } = useAutosave({
    value: settingsSnapshot,
    save: persistSettings,
    enabled: !loading && !loadError,
  });

  const handleResetPlayback = () => {
    const confirmed = window.confirm(
      "Reset web launch and TV playback? Your service list, ranking, and remembered draw filters are kept."
    );
    if (!confirmed) return;
    setDefaultDrawSettings({
      ...defaultDrawSettings,
      enablePreferredWebLaunch: DEFAULT_DRAW_SETTINGS.enablePreferredWebLaunch,
      theaterModeEnabled: DEFAULT_DRAW_SETTINGS.theaterModeEnabled,
      theaterTrailerCount: DEFAULT_DRAW_SETTINGS.theaterTrailerCount,
    });
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
              { href: "#streaming-services", label: "Streaming", value: streamingTileSummary },
              { href: "#tv-playback", label: "TV playback", value: playbackTileSummary },
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
                <>
                  <p className="mt-1 text-sm text-slate-400">
                    Tap a number to change its position.
                  </p>
                  <ol aria-label="Streaming service ranking" className="mt-3 space-y-2">
                    {streamingServices.map((service, index) => (
                      <li key={service}>
                        <div
                          className={`h-0.5 rounded-full transition ${
                            dropIndex === index && draggedService ? "bg-rose-500" : "bg-transparent"
                          }`}
                          aria-hidden="true"
                        />
                        <div
                          draggable
                          onDragStart={(event) => {
                            setDraggedService(service);
                            setDropIndex(index);
                            event.dataTransfer.setData("text/plain", String(index));
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDraggedService(null);
                            setDropIndex(null);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDropIndex(dropIndexForPointer(event, index));
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            commitDrop(dropIndexForPointer(event, index));
                          }}
                          className={`flex items-center justify-between gap-1 rounded-xl border px-2 py-2 sm:gap-2 sm:p-3 transition ${index === 0 ? "border-rose-500/40 bg-rose-950/20" : "border-slate-800 bg-slate-950/40 hover:border-slate-600"} ${
                            draggedService === service ? "opacity-60" : ""
                          }`}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                            <span
                              className="hidden cursor-grab text-slate-500 sm:inline"
                              aria-hidden="true"
                              title="Drag to reorder"
                            >
                              ⋮⋮
                            </span>
                            <select
                              aria-label={`Position of ${service}`}
                              value={index}
                              onChange={(event) => moveServiceByOffset(service, Number(event.target.value) - index)}
                              className={`h-11 w-12 shrink-0 cursor-pointer rounded-lg border-0 pl-2 text-sm font-semibold tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400 ${index === 0 ? "bg-rose-950/50 text-rose-200" : "bg-slate-800 text-slate-200"}`}
                            >
                              {streamingServices.map((_, position) => (
                                <option key={position} value={position}>{position + 1}</option>
                              ))}
                            </select>
                            <ServiceLogo service={service} className="h-7 w-7 sm:h-9 sm:w-9" />
                            <div className="min-w-0">
                              <span className="block break-words text-sm font-semibold text-slate-100 sm:text-base">{service}</span>
                              {index === 0 && <span className="block text-xs text-rose-300">First choice</span>}
                            </div>
                          </div>
                          <div className="ml-auto flex shrink-0 items-center rounded-lg sm:border sm:border-slate-700/60 sm:bg-slate-900/70">
                            <button
                              type="button"
                              onClick={() => moveServiceByOffset(service, -1)}
                              disabled={index === 0}
                              className="hidden h-11 w-11 items-center justify-center rounded-lg text-lg text-slate-300 sm:inline-flex transition hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400 disabled:cursor-not-allowed disabled:opacity-25 sm:w-11"
                              aria-label={`Move ${service} up`}
                              title={`Move ${service} up`}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveServiceByOffset(service, 1)}
                              disabled={index === streamingServices.length - 1}
                              className="hidden h-11 w-11 items-center justify-center rounded-lg text-lg text-slate-300 sm:inline-flex transition hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400 disabled:cursor-not-allowed disabled:opacity-25 sm:w-11"
                              aria-label={`Move ${service} down`}
                              title={`Move ${service} down`}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleService(service)}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-lg text-slate-500 transition hover:bg-rose-950/60 hover:text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400 sm:w-11"
                              aria-label={`Remove ${service}`}
                              title={`Remove ${service}`}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        {index === streamingServices.length - 1 && (
                          <div
                            className={`mt-1.5 h-0.5 rounded-full transition ${
                              dropIndex === index + 1 && draggedService ? "bg-rose-500" : "bg-transparent"
                            }`}
                            aria-hidden="true"
                          />
                        )}
                      </li>
                    ))}
                  </ol>
                </>
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
            </div>
          </section>

          <section id="tv-playback" tabIndex={-1} className="panel scroll-mt-24" aria-labelledby="tv-playback-heading">
            <h2 id="tv-playback-heading" className="section-title">TV &amp; playback</h2>
            <p className="mt-1 text-sm text-slate-400">
              How the TV app behaves once a movie is drawn.
            </p>

            <div className="mt-5 space-y-4">
              <SettingToggle
                id="theater-mode-enabled"
                name="theater_mode_enabled"
                ariaLabel="Enable TV theater mode"
                label="Theater mode"
                description="Play previews from other movies in the bowl before starting the drawn movie."
                checked={defaultDrawSettings.theaterModeEnabled}
                onChange={(event) =>
                  setDefaultDrawSettings({
                    ...defaultDrawSettings,
                    theaterModeEnabled: event.target.checked,
                  })
                }
              />

              {defaultDrawSettings.theaterModeEnabled && (
                <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-4">
                  <label htmlFor="theater-trailer-count" className="text-sm text-slate-300">
                    Previews before the movie
                  </label>
                  <select
                    id="theater-trailer-count"
                    name="theater_trailer_count"
                    aria-label="Theater mode preview count"
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    value={defaultDrawSettings.theaterTrailerCount}
                    onChange={(event) =>
                      setDefaultDrawSettings({
                        ...defaultDrawSettings,
                        theaterTrailerCount: Number(event.target.value),
                      })
                    }
                  >
                    {THEATER_TRAILER_COUNT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </section>

          <div className="panel-muted flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-400">
              Reset web launch and TV playback. Your service list, ranking, and remembered draw filters are kept.
            </p>
            <button type="button" className="btn btn-danger sm:shrink-0" onClick={handleResetPlayback}>
              Reset playback
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
