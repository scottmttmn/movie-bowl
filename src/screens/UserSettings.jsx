import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import useAutosave, { valuesAreEqual } from "../hooks/useAutosave";
import AutosaveStatus from "../components/AutosaveStatus";
import FilterChipSelect from "../components/FilterChipSelect";
import { AVAILABLE_STREAMING_SERVICES } from "../utils/streamingServices";
import {
  DEFAULT_DRAW_SETTINGS,
  DRAW_GENRE_OPTIONS,
  normalizeDefaultDrawSettings,
  RUNTIME_FILTER_MAX_MINUTES,
  RUNTIME_FILTER_MIN_MINUTES,
  THEATER_TRAILER_COUNT_OPTIONS,
} from "../utils/drawSettings";
import { MPAA_RATING_OPTIONS } from "../utils/movieRatings";

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

// A filter whose current value is readable while collapsed — the summary is the
// point, so nobody has to open three panels to see what a draw will start from.
function SettingDisclosure({ id, title, summary, editLabel, open, onToggle, children }) {
  return (
    <div className="surface-card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition hover:bg-slate-900/70"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
      >
        <span className="min-w-0">
          <span className="block text-base font-semibold text-slate-100">{title}</span>
          <span className="mt-0.5 block truncate text-sm text-slate-400">{summary}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-rose-300">
          {open ? `Hide ${editLabel}` : `Edit ${editLabel}`}
        </span>
      </button>
      {open && (
        <div id={`${id}-panel`} className="border-t border-slate-800 px-3.5 py-3.5">
          {children}
        </div>
      )}
    </div>
  );
}

// Hero tile: reads back one section's current state and jumps to it.
function SummaryTile({ href, label, value }) {
  return (
    <a
      href={href}
      className="surface-card block px-3.5 py-3 transition hover:border-slate-600 hover:bg-slate-900/60"
    >
      <span className="eyebrow block text-[0.65rem]">{label}</span>
      <span className="mt-1.5 block text-sm text-slate-200">{value}</span>
    </a>
  );
}

export default function UserSettings() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [draggedService, setDraggedService] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [showDefaultRatings, setShowDefaultRatings] = useState(false);
  const [showDefaultGenres, setShowDefaultGenres] = useState(false);
  const [showDefaultRuntime, setShowDefaultRuntime] = useState(false);
  const streamingServicesRef = useRef(null);
  const {
    streamingServices,
    setStreamingServices,
    defaultDrawSettings,
    setDefaultDrawSettings,
    toggleService,
    loading,
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

  const selectedDefaultGenres = Array.isArray(defaultDrawSettings.selectedGenres)
    ? defaultDrawSettings.selectedGenres
    : DRAW_GENRE_OPTIONS;
  const defaultRatingSummary = useMemo(() => {
    const selectedCount = defaultDrawSettings.selectedRatings.length;
    if (selectedCount === MPAA_RATING_OPTIONS.length && defaultDrawSettings.includeUnknownRatings) {
      return "All ratings";
    }
    if (selectedCount === 0 && !defaultDrawSettings.includeUnknownRatings) {
      return "No ratings selected";
    }
    const parts = [];
    if (selectedCount === MPAA_RATING_OPTIONS.length) {
      parts.push("All rated");
    } else if (selectedCount > 0) {
      parts.push(defaultDrawSettings.selectedRatings.join(", "));
    }
    if (defaultDrawSettings.includeUnknownRatings) parts.push("Unknown");
    return parts.join(" • ");
  }, [defaultDrawSettings.includeUnknownRatings, defaultDrawSettings.selectedRatings]);
  const defaultGenreSummary = useMemo(() => {
    if (defaultDrawSettings.selectedGenres === null && defaultDrawSettings.includeUnknownGenres) {
      return "All genres";
    }
    if (selectedDefaultGenres.length === 0 && !defaultDrawSettings.includeUnknownGenres) {
      return "No genres selected";
    }
    const parts = [];
    if (defaultDrawSettings.selectedGenres === null) {
      parts.push("All listed genres");
    } else if (selectedDefaultGenres.length <= 3) {
      parts.push(selectedDefaultGenres.join(", "));
    } else {
      parts.push(`${selectedDefaultGenres.length} genres`);
    }
    if (defaultDrawSettings.includeUnknownGenres) parts.push("Unknown");
    return parts.filter(Boolean).join(" • ");
  }, [
    defaultDrawSettings.includeUnknownGenres,
    defaultDrawSettings.selectedGenres,
    selectedDefaultGenres,
  ]);
  const defaultRuntimeSummary = useMemo(() => {
    const base = `${defaultDrawSettings.runtimeMinMinutes}-${defaultDrawSettings.runtimeMaxMinutes} min`;
    return defaultDrawSettings.includeUnknownRuntime ? `${base} • Unknown` : base;
  }, [
    defaultDrawSettings.includeUnknownRuntime,
    defaultDrawSettings.runtimeMaxMinutes,
    defaultDrawSettings.runtimeMinMinutes,
  ]);

  const streamingTileSummary = useMemo(() => {
    if (!hasServices) return "No services picked yet";
    const count = `${streamingServices.length} service${streamingServices.length === 1 ? "" : "s"}`;
    if (!defaultDrawSettings.prioritizeStreaming) return `${count} • Not prioritized`;
    return `${count} • ${defaultDrawSettings.useStreamingRank ? "Ranked priority" : "Equal priority"}`;
  }, [
    defaultDrawSettings.prioritizeStreaming,
    defaultDrawSettings.useStreamingRank,
    hasServices,
    streamingServices.length,
  ]);
  const filtersTileSummary = `${defaultRatingSummary} • ${defaultGenreSummary} • ${defaultRuntimeSummary}`;
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
    () => ({ streamingServices, defaultDrawSettings }),
    [streamingServices, defaultDrawSettings]
  );

  // Writes only the halves that actually changed, so flipping one draw toggle
  // does not rewrite the streaming list as well.
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
    enabled: !loading,
  });

  const handleResetDefaults = () => {
    // Autosave persists this straight away, so confirm before discarding a
    // hand-tuned set of filters.
    const confirmed = window.confirm(
      "Reset your draw filters, streaming preferences, and TV playback back to their defaults? Your service list is kept."
    );
    if (!confirmed) return;
    setDefaultDrawSettings(normalizeDefaultDrawSettings(DEFAULT_DRAW_SETTINGS));
  };

  // Show loading indicator while fetching data
  if (loading) {
    return (
      <div className="page-container py-8">
        <div className="panel text-sm text-slate-400" role="status">Loading...</div>
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
                These follow you into every bowl — they prefill each draw and shape what the TV app plays.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 min-[420px]:flex-row min-[420px]:items-center sm:flex-col sm:items-end">
              <AutosaveStatus status={saveStatus} />
              <button onClick={() => navigate(-1)} className="btn btn-secondary">
                Back
              </button>
            </div>
          </div>

          <nav aria-label="Settings sections" className="mt-6 grid gap-2 sm:grid-cols-3">
            <SummaryTile href="#streaming-services" label="Streaming" value={streamingTileSummary} />
            <SummaryTile href="#draw-defaults" label="Draw filters" value={filtersTileSummary} />
            <SummaryTile href="#tv-playback" label="TV playback" value={playbackTileSummary} />
          </nav>
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
              Say what you can actually play tonight, then rank it. Draws can prefer titles waiting on your top service.
            </p>

            <div className="mt-5">
              <h3 className="eyebrow">Your ranking</h3>
              {!hasServices ? (
                <p className="surface-card mt-2 px-3.5 py-3 text-sm text-slate-400">
                  Nothing picked yet. Choose services below and they will show up here in priority order.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-slate-400">
                    Drag a row or use the arrows. Higher services are prioritized first.
                  </p>
                  <ol className="mt-3 space-y-1.5">
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
                          className={`surface-card flex items-center justify-between gap-2 px-3 py-2 transition hover:border-slate-600 ${
                            draggedService === service ? "opacity-60" : ""
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className="cursor-grab text-slate-500"
                              aria-hidden="true"
                              title="Drag to reorder"
                            >
                              ⋮⋮
                            </span>
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-950/70 text-xs font-semibold text-slate-300">
                              {index + 1}
                            </span>
                            <span className="truncate text-slate-100">{service}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveServiceByOffset(service, -1)}
                              disabled={index === 0}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`Move ${service} up`}
                              title={`Move ${service} up`}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveServiceByOffset(service, 1)}
                              disabled={index === streamingServices.length - 1}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`Move ${service} down`}
                              title={`Move ${service} down`}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleService(service)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-950/60 hover:text-rose-200"
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

            <div className="mt-6 border-t border-slate-800 pt-5">
              <h3 className="eyebrow">Pick your services</h3>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="streaming-services-search"
                  name="streaming_services_search"
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
                        {service}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-6 space-y-4 border-t border-slate-800 pt-5">
              <h3 className="eyebrow">How draws use them</h3>
              <SettingToggle
                id="default-prioritize-streaming"
                name="default_prioritize_streaming"
                ariaLabel="Default prioritize streaming services"
                label="Prioritize my streaming services"
                description="Prefer titles available on your saved services."
                note={hasServices ? "" : "Pick at least one service to turn this on."}
                checked={defaultDrawSettings.prioritizeStreaming}
                disabled={!hasServices}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setDefaultDrawSettings({
                    ...defaultDrawSettings,
                    prioritizeStreaming: checked,
                    useStreamingRank: checked ? true : defaultDrawSettings.useStreamingRank,
                  });
                }}
              />

              {defaultDrawSettings.prioritizeStreaming && hasServices && (
                <div className="border-t border-slate-800 pt-4">
                  <SettingToggle
                    id="default-use-streaming-rank"
                    name="default_use_streaming_rank"
                    ariaLabel="Default use streaming rank"
                    label="Follow my ranking order"
                    description="If off, every matching service is treated equally."
                    checked={defaultDrawSettings.useStreamingRank}
                    onChange={(event) =>
                      setDefaultDrawSettings({
                        ...defaultDrawSettings,
                        useStreamingRank: event.target.checked,
                      })
                    }
                  />
                </div>
              )}

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

          <section id="draw-defaults" className="panel scroll-mt-24" aria-labelledby="draw-defaults-heading">
            <h2 id="draw-defaults-heading" className="section-title">Draw filter defaults</h2>
            <p className="mt-1 text-sm text-slate-400">
              Every bowl you open starts from these filters. You can still change them for a single draw.
            </p>

            <div className="mt-5 space-y-2.5">
              <SettingDisclosure
                id="default-rating-settings"
                title="Ratings"
                editLabel="ratings"
                summary={defaultRatingSummary}
                open={showDefaultRatings}
                onToggle={() => setShowDefaultRatings((prev) => !prev)}
              >
                <FilterChipSelect
                  ariaLabel="Default rating controls"
                  options={MPAA_RATING_OPTIONS}
                  selectedValues={defaultDrawSettings.selectedRatings}
                  optionAriaLabelPrefix="Default rating"
                  onToggle={(rating) =>
                    setDefaultDrawSettings({
                      ...defaultDrawSettings,
                      selectedRatings: defaultDrawSettings.selectedRatings.includes(rating)
                        ? defaultDrawSettings.selectedRatings.filter((value) => value !== rating)
                        : [...defaultDrawSettings.selectedRatings, rating],
                    })
                  }
                  onOnly={(rating) =>
                    setDefaultDrawSettings({
                      ...defaultDrawSettings,
                      selectedRatings: [rating],
                    })
                  }
                  onSelectAll={() =>
                    setDefaultDrawSettings({
                      ...defaultDrawSettings,
                      selectedRatings: MPAA_RATING_OPTIONS,
                    })
                  }
                  onClear={() =>
                    setDefaultDrawSettings({
                      ...defaultDrawSettings,
                      selectedRatings: [],
                    })
                  }
                  unknownEnabled={defaultDrawSettings.includeUnknownRatings}
                  unknownLabel="Unrated/Unknown"
                  onToggleUnknown={(value) =>
                    setDefaultDrawSettings({
                      ...defaultDrawSettings,
                      includeUnknownRatings: value,
                    })
                  }
                />
              </SettingDisclosure>

              <SettingDisclosure
                id="default-genre-settings"
                title="Genres"
                editLabel="genres"
                summary={defaultGenreSummary}
                open={showDefaultGenres}
                onToggle={() => setShowDefaultGenres((prev) => !prev)}
              >
                <p className="mb-2 text-sm text-slate-400">
                  Choose which genres should be included by default.
                </p>
                <FilterChipSelect
                  ariaLabel="Default genre controls"
                  options={DRAW_GENRE_OPTIONS}
                  selectedValues={selectedDefaultGenres}
                  optionAriaLabelPrefix="Default genre"
                  onToggle={(genre) => {
                    const base = Array.isArray(defaultDrawSettings.selectedGenres)
                      ? defaultDrawSettings.selectedGenres
                      : DRAW_GENRE_OPTIONS;
                    setDefaultDrawSettings({
                      ...defaultDrawSettings,
                      selectedGenres: base.includes(genre)
                        ? base.filter((value) => value !== genre)
                        : [...base, genre],
                    });
                  }}
                  onOnly={(genre) =>
                    setDefaultDrawSettings({
                      ...defaultDrawSettings,
                      selectedGenres: [genre],
                    })
                  }
                  onSelectAll={() =>
                    setDefaultDrawSettings({
                      ...defaultDrawSettings,
                      selectedGenres: null,
                    })
                  }
                  onClear={() =>
                    setDefaultDrawSettings({
                      ...defaultDrawSettings,
                      selectedGenres: [],
                    })
                  }
                  unknownEnabled={defaultDrawSettings.includeUnknownGenres}
                  unknownLabel="Uncategorized/Unknown"
                  onToggleUnknown={(value) =>
                    setDefaultDrawSettings({
                      ...defaultDrawSettings,
                      includeUnknownGenres: value,
                    })
                  }
                />
              </SettingDisclosure>

              <SettingDisclosure
                id="default-runtime-settings"
                title="Length"
                editLabel="runtime"
                summary={defaultRuntimeSummary}
                open={showDefaultRuntime}
                onToggle={() => setShowDefaultRuntime((prev) => !prev)}
              >
                <p className="text-sm text-slate-400">
                  Set the acceptable runtime range to prefill bowl draw filters.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label htmlFor="default-draw-runtime-min" className="text-sm text-slate-300">
                    Minimum minutes
                    <input
                      id="default-draw-runtime-min"
                      name="default_draw_runtime_min"
                      aria-label="default_draw_runtime_min"
                      type="number"
                      min={RUNTIME_FILTER_MIN_MINUTES}
                      max={defaultDrawSettings.runtimeMaxMinutes}
                      value={defaultDrawSettings.runtimeMinMinutes}
                      onChange={(event) => {
                        const value = Number.parseInt(event.target.value || "0", 10);
                        if (!Number.isFinite(value)) return;
                        setDefaultDrawSettings({
                          ...defaultDrawSettings,
                          runtimeMinMinutes: Math.max(
                            RUNTIME_FILTER_MIN_MINUTES,
                            Math.min(defaultDrawSettings.runtimeMaxMinutes, value)
                          ),
                        });
                      }}
                      className="input-field mt-1 w-full"
                    />
                  </label>
                  <label htmlFor="default-draw-runtime-max" className="text-sm text-slate-300">
                    Maximum minutes
                    <input
                      id="default-draw-runtime-max"
                      name="default_draw_runtime_max"
                      aria-label="default_draw_runtime_max"
                      type="number"
                      min={defaultDrawSettings.runtimeMinMinutes}
                      max={RUNTIME_FILTER_MAX_MINUTES}
                      value={defaultDrawSettings.runtimeMaxMinutes}
                      onChange={(event) => {
                        const value = Number.parseInt(event.target.value || "0", 10);
                        if (!Number.isFinite(value)) return;
                        setDefaultDrawSettings({
                          ...defaultDrawSettings,
                          runtimeMaxMinutes: Math.max(
                            defaultDrawSettings.runtimeMinMinutes,
                            Math.min(RUNTIME_FILTER_MAX_MINUTES, value)
                          ),
                        });
                      }}
                      className="input-field mt-1 w-full"
                    />
                  </label>
                </div>
                <div className="mt-3 space-y-3">
                  <label htmlFor="default-draw-runtime-min-slider" className="block text-sm text-slate-300">
                    Minimum runtime
                    <input
                      id="default-draw-runtime-min-slider"
                      name="default_draw_runtime_min_slider"
                      aria-label="default_draw_runtime_min_slider"
                      type="range"
                      min={RUNTIME_FILTER_MIN_MINUTES}
                      max={defaultDrawSettings.runtimeMaxMinutes}
                      value={defaultDrawSettings.runtimeMinMinutes}
                      onChange={(event) =>
                        setDefaultDrawSettings({
                          ...defaultDrawSettings,
                          runtimeMinMinutes: Math.max(
                            RUNTIME_FILTER_MIN_MINUTES,
                            Math.min(
                              defaultDrawSettings.runtimeMaxMinutes,
                              Number.parseInt(event.target.value || "0", 10) || RUNTIME_FILTER_MIN_MINUTES
                            )
                          ),
                        })
                      }
                      className="mt-1 w-full"
                    />
                  </label>
                  <label htmlFor="default-draw-runtime-max-slider" className="block text-sm text-slate-300">
                    Maximum runtime
                    <input
                      id="default-draw-runtime-max-slider"
                      name="default_draw_runtime_max_slider"
                      aria-label="default_draw_runtime_max_slider"
                      type="range"
                      min={defaultDrawSettings.runtimeMinMinutes}
                      max={RUNTIME_FILTER_MAX_MINUTES}
                      value={defaultDrawSettings.runtimeMaxMinutes}
                      onChange={(event) =>
                        setDefaultDrawSettings({
                          ...defaultDrawSettings,
                          runtimeMaxMinutes: Math.max(
                            defaultDrawSettings.runtimeMinMinutes,
                            Math.min(
                              RUNTIME_FILTER_MAX_MINUTES,
                              Number.parseInt(event.target.value || "0", 10) || RUNTIME_FILTER_MAX_MINUTES
                            )
                          ),
                        })
                      }
                      className="mt-1 w-full"
                    />
                  </label>
                </div>
                <label
                  htmlFor="default-draw-runtime-unknown"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-300"
                >
                  <input
                    id="default-draw-runtime-unknown"
                    name="default_draw_runtime_unknown"
                    aria-label="Default include unknown runtime"
                    type="checkbox"
                    checked={defaultDrawSettings.includeUnknownRuntime}
                    onChange={(event) =>
                      setDefaultDrawSettings({
                        ...defaultDrawSettings,
                        includeUnknownRuntime: event.target.checked,
                      })
                    }
                  />
                  Include unknown runtime
                </label>
              </SettingDisclosure>
            </div>
          </section>

          <section id="tv-playback" className="panel scroll-mt-24" aria-labelledby="tv-playback-heading">
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
              Put your draw filters, streaming preferences, and TV playback back the way they shipped. Your service
              list is kept.
            </p>
            <button type="button" className="btn btn-danger sm:shrink-0" onClick={handleResetDefaults}>
              Reset to defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
