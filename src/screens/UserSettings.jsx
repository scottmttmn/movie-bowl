import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import FilterChipSelect from "../components/FilterChipSelect";
import { AVAILABLE_STREAMING_SERVICES } from "../utils/streamingServices";
import {
  DEFAULT_DRAW_SETTINGS,
  DRAW_GENRE_OPTIONS,
  normalizeDefaultDrawSettings,
  RUNTIME_FILTER_MAX_MINUTES,
  RUNTIME_FILTER_MIN_MINUTES,
} from "../utils/drawSettings";
import { MPAA_RATING_OPTIONS } from "../utils/movieRatings";
import { useRokuDevice } from "../context/RokuDeviceContext";

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

export default function UserSettings() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [draggedService, setDraggedService] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [showDefaultRatings, setShowDefaultRatings] = useState(false);
  const [showDefaultGenres, setShowDefaultGenres] = useState(false);
  const [showDefaultRuntime, setShowDefaultRuntime] = useState(false);
  const [manualRokuIp, setManualRokuIp] = useState("");
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
  } =
    useUserStreamingServices();
  const {
    devices: rokuDevices,
    selectedRoku,
    selectedRokuIp,
    setSelectedRokuIp,
    setupSteps: rokuSetupSteps,
    deviceError: rokuDeviceError,
    setDeviceError: setRokuDeviceError,
    discoveryLoading: isDiscoveringRokus,
    discoverDevices,
    validateManualIp,
  } = useRokuDevice();

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

  useEffect(() => {
    if (location.hash !== "#streaming-services") return;
    streamingServicesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash]);

  // Function to save the updated streaming services to the database
  const handleSave = async () => {
    const [streamingResponse, drawSettingsResponse] = await Promise.all([
      saveStreamingServices(streamingServices),
      saveDefaultDrawSettings(defaultDrawSettings),
    ]);

    const error = streamingResponse.error || drawSettingsResponse.error;
    if (error) return;

    // Notify the user that their changes have been saved
    alert("Saved");
  };

  // Show loading indicator while fetching data
  if (loading) return <div>Loading...</div>;

  return (
    <div className="page-container py-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-slate-800">User Settings</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="btn btn-secondary"
          >
            Back
          </button>
          <button
            onClick={handleSave}
            className="btn btn-primary"
          >
            Save
          </button>
        </div>
      </div>

      <section className="panel section-stack">
      <div
        id="streaming-services"
        ref={streamingServicesRef}
        className="scroll-mt-24"
      >
        <h3 className="mb-2 text-lg font-semibold text-slate-800">Streaming Services</h3>
        <p className="mb-3 text-sm text-slate-600">
          Choose your services, then rank them for draw priority.
        </p>
      </div>
      <div className="mb-4">
        <input
          id="streaming-services-search"
          name="streaming_services_search"
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search services..."
          className="input-field"
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            const next = appendMissingServices(streamingServices, AVAILABLE_STREAMING_SERVICES);
            setStreamingServices(next);
          }}
          className="btn btn-ghost text-sm px-2.5 py-1.5"
        >
          Select all services
        </button>
        <button
          type="button"
          onClick={() => {
            setStreamingServices([]);
          }}
          className="btn btn-ghost text-sm px-2.5 py-1.5"
        >
          Clear
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
          className="btn btn-ghost text-sm px-2.5 py-1.5"
        >
          Only major
        </button>
      </div>

      {streamingServices.length > 0 && (
        <div className="mb-5">
          <p className="text-sm font-medium text-slate-700 mb-2">Priority order for draw</p>
          <p className="text-xs text-slate-500 mb-2">
            Drag to reorder. Higher items are prioritized first.
          </p>
          <div className="space-y-2">
            <div
              className={dropIndex === 0 ? "h-3 rounded-full bg-blue-500" : "h-3"}
              onDragOver={(event) => {
                event.preventDefault();
                setDropIndex(0);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const next = moveServiceToIndex(draggedService, 0);
                setDraggedService(null);
                setDropIndex(null);
                if (!next) return;
                setStreamingServices(next);
              }}
            />
            {streamingServices.map((service, index) => (
              <div key={service}>
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
                    const rect = event.currentTarget.getBoundingClientRect();
                    const nextDropIndex = event.clientY < rect.top + rect.height / 2 ? index : index + 1;
                    setDropIndex(nextDropIndex);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    const nextDropIndex = event.clientY < rect.top + rect.height / 2 ? index : index + 1;
                    const next = moveServiceToIndex(draggedService, nextDropIndex);
                    setDraggedService(null);
                    setDropIndex(null);
                    if (!next) return;
                    setStreamingServices(next);
                  }}
                  className={[
                    "flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 bg-white transition",
                    draggedService === service ? "opacity-60" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-500 w-6 text-right">
                      {index + 1}
                    </span>
                    <span className="text-slate-800">{service}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveServiceByOffset(service, -1)}
                      disabled={index === 0}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Move ${service} up`}
                      title={`Move ${service} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveServiceByOffset(service, 1)}
                      disabled={index === streamingServices.length - 1}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Move ${service} down`}
                      title={`Move ${service} down`}
                    >
                      ↓
                    </button>
                    <span className="text-slate-400 cursor-grab" aria-hidden="true">⋮⋮</span>
                    <button
                      type="button"
                      onClick={() => toggleService(service)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                      aria-label={`Remove ${service}`}
                      title={`Remove ${service}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div
                  className={dropIndex === index + 1 ? "mt-1 h-3 rounded-full bg-blue-500" : "mt-1 h-3"}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropIndex(index + 1);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const next = moveServiceToIndex(draggedService, index + 1);
                    setDraggedService(null);
                    setDropIndex(null);
                    if (!next) return;
                    setStreamingServices(next);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Render checkboxes for each streaming service */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
      {filteredServices.map((service) => {
        const serviceKey = service.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        return (
        <label key={service} htmlFor={`streaming-service-${serviceKey}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
          <input
            id={`streaming-service-${serviceKey}`}
            name="streaming_services"
            type="checkbox"
            checked={streamingServices.includes(service)}
            onChange={() => toggleService(service)}
          />
          {service}
        </label>
      )})}
      </div>
      {filteredServices.length === 0 && (
        <div className="text-sm text-slate-500 mb-6">No matching services.</div>
      )}
      <div className="panel-muted border-b border-slate-200/80 pb-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">Default Draw Settings</h3>
          <button
            type="button"
            className="text-xs font-medium text-blue-700 hover:text-blue-800"
            onClick={() => setDefaultDrawSettings(normalizeDefaultDrawSettings(DEFAULT_DRAW_SETTINGS))}
          >
            Reset to defaults
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          These settings prefill the draw filters when you open a bowl.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-left">
              <p className="text-sm font-medium text-gray-800">Prioritize my streaming services</p>
              <p className="text-xs text-gray-500">Prefer titles available on your saved services.</p>
            </div>
            <label htmlFor="default-prioritize-streaming" className="relative inline-flex items-center cursor-pointer">
              <input
                id="default-prioritize-streaming"
                name="default_prioritize_streaming"
                aria-label="Default prioritize streaming services"
                type="checkbox"
                className="peer sr-only"
                checked={defaultDrawSettings.prioritizeStreaming}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setDefaultDrawSettings({
                    ...defaultDrawSettings,
                    prioritizeStreaming: checked,
                    useStreamingRank: checked ? true : defaultDrawSettings.useStreamingRank,
                  });
                }}
                disabled={streamingServices.length === 0}
              />
              <span className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-blue-600 peer-disabled:bg-gray-200" />
              <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </label>
          </div>

          {defaultDrawSettings.prioritizeStreaming && streamingServices.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <div className="text-left">
                <p className="text-sm font-medium text-gray-800">Use my service ranking</p>
                <p className="text-xs text-gray-500">If off, matching services are treated equally.</p>
              </div>
              <label htmlFor="default-use-streaming-rank" className="relative inline-flex items-center cursor-pointer">
                <input
                  id="default-use-streaming-rank"
                  name="default_use_streaming_rank"
                  aria-label="Default use streaming rank"
                  type="checkbox"
                  className="peer sr-only"
                  checked={defaultDrawSettings.useStreamingRank}
                  onChange={(event) =>
                    setDefaultDrawSettings({
                      ...defaultDrawSettings,
                      useStreamingRank: event.target.checked,
                    })
                  }
                />
                <span className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-blue-600" />
                <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
              </label>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div className="text-left">
              <p className="text-sm font-medium text-gray-800">Open preferred Roku app for drawn movies</p>
              <p className="text-xs text-gray-500">Quietly show a Roku launch button only when a preferred installed app is available.</p>
            </div>
            <label htmlFor="enable-preferred-roku-app-launch" className="relative inline-flex items-center cursor-pointer">
              <input
                id="enable-preferred-roku-app-launch"
                name="enable_preferred_roku_app_launch"
                aria-label="Enable preferred Roku app launch"
                type="checkbox"
                className="peer sr-only"
                checked={defaultDrawSettings.enablePreferredRokuAppLaunch}
                onChange={(event) =>
                  setDefaultDrawSettings({
                    ...defaultDrawSettings,
                    enablePreferredRokuAppLaunch: event.target.checked,
                  })
                }
                disabled={streamingServices.length === 0}
              />
              <span className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-blue-600 peer-disabled:bg-gray-200" />
              <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div className="text-left">
              <p className="text-sm font-medium text-gray-800">Open preferred streaming website for drawn movies</p>
              <p className="text-xs text-gray-500">Show a web launch button when a ranked service match supports direct search links.</p>
            </div>
            <label htmlFor="enable-preferred-web-launch" className="relative inline-flex items-center cursor-pointer">
              <input
                id="enable-preferred-web-launch"
                name="enable_preferred_web_launch"
                aria-label="Enable preferred web launch"
                type="checkbox"
                className="peer sr-only"
                checked={defaultDrawSettings.enablePreferredWebLaunch}
                onChange={(event) =>
                  setDefaultDrawSettings({
                    ...defaultDrawSettings,
                    enablePreferredWebLaunch: event.target.checked,
                  })
                }
                disabled={streamingServices.length === 0}
              />
              <span className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-blue-600 peer-disabled:bg-gray-200" />
              <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </label>
          </div>

          {defaultDrawSettings.enablePreferredRokuAppLaunch && (
            <div className="border-t border-slate-200 pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-800">
                    Preferred Roku: {selectedRoku ? `${selectedRoku.name} (${selectedRoku.ip})` : "Not selected"}
                  </p>
                  <p className="text-xs text-gray-500">
                    This device will be used quietly from the bowl page when possible.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => discoverDevices()}
                  disabled={isDiscoveringRokus}
                >
                  {isDiscoveringRokus ? "Scanning..." : "Rescan Rokus"}
                </button>
              </div>

              {rokuDevices.length > 0 && (
                <div className="mt-3 space-y-2">
                  {rokuDevices.map((device) => (
                    <label
                      key={`${device.ip}:${device.port}`}
                      className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                        selectedRokuIp === device.ip
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div>
                        <div className="font-medium text-slate-900">{device.name}</div>
                        <div className="text-xs text-slate-500">{device.ip}:{device.port}</div>
                      </div>
                      <input
                        type="radio"
                        name="preferred-roku-device"
                        checked={selectedRokuIp === device.ip}
                        onChange={() => setSelectedRokuIp(device.ip)}
                      />
                    </label>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={manualRokuIp}
                  onChange={(event) => setManualRokuIp(event.target.value)}
                  placeholder="Manual Roku IP"
                  className="input-field"
                />
                <button
                  type="button"
                  className="btn btn-secondary sm:min-w-40"
                  onClick={async () => {
                    setRokuDeviceError("");
                    await validateManualIp(manualRokuIp);
                  }}
                  disabled={isDiscoveringRokus}
                >
                  Validate Roku
                </button>
              </div>

              {rokuDeviceError && <p className="mt-2 text-sm text-red-600">{rokuDeviceError}</p>}
              {rokuSetupSteps.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-slate-500">
                  {rokuSetupSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="border-t border-slate-200 pt-4 text-left">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-left"
              onClick={() => setShowDefaultRatings((prev) => !prev)}
              aria-expanded={showDefaultRatings}
              aria-controls="default-rating-settings-panel"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">Default ratings</p>
                <p className="mt-0.5 text-xs text-gray-500">{defaultRatingSummary}</p>
              </div>
              <span className="text-xs font-medium text-blue-700">
                {showDefaultRatings ? "Hide ratings" : "Edit ratings"}
              </span>
            </button>
            {showDefaultRatings && (
              <div id="default-rating-settings-panel" className="mt-2">
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
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-4 text-left">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-left"
              onClick={() => setShowDefaultGenres((prev) => !prev)}
              aria-expanded={showDefaultGenres}
              aria-controls="default-genre-settings-panel"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">Default genres</p>
                <p className="mt-0.5 text-xs text-gray-500">{defaultGenreSummary}</p>
              </div>
              <span className="text-xs font-medium text-blue-700">
                {showDefaultGenres ? "Hide genres" : "Edit genres"}
              </span>
            </button>
            {showDefaultGenres && (
              <div id="default-genre-settings-panel" className="mt-2">
                <p className="mb-2 text-xs text-gray-500">Choose which genres should be included by default.</p>
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
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-4 text-left">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-left"
              onClick={() => setShowDefaultRuntime((prev) => !prev)}
              aria-expanded={showDefaultRuntime}
              aria-controls="default-runtime-settings-panel"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">Default runtime filter</p>
                <p className="mt-0.5 text-xs text-gray-500">{defaultRuntimeSummary}</p>
              </div>
              <span className="text-xs font-medium text-blue-700">
                {showDefaultRuntime ? "Hide runtime" : "Edit runtime"}
              </span>
            </button>
            {showDefaultRuntime && (
              <div id="default-runtime-settings-panel" className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-xs text-gray-500">
                  Set the acceptable runtime range to prefill bowl draw filters.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label htmlFor="default-draw-runtime-min" className="text-sm text-slate-700">
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
                  <label htmlFor="default-draw-runtime-max" className="text-sm text-slate-700">
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
                  <label htmlFor="default-draw-runtime-min-slider" className="block text-xs text-slate-500">
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
                  <label htmlFor="default-draw-runtime-max-slider" className="block text-xs text-slate-500">
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
                <label htmlFor="default-draw-runtime-unknown" className="mt-3 inline-flex items-center gap-1.5 text-sm text-slate-700">
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
              </div>
            )}
          </div>
        </div>
      </div>
      </section>
    </div>
  );
}
