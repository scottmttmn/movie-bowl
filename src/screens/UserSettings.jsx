import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import { AVAILABLE_STREAMING_SERVICES } from "../utils/streamingServices";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [draggedService, setDraggedService] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const { streamingServices, setStreamingServices, toggleService, loading, saveStreamingServices } =
    useUserStreamingServices();

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

  // Function to save the updated streaming services to the database
  const handleSave = async () => {
    const { error } = await saveStreamingServices(streamingServices);
    if (error) return;

    // Notify the user that their changes have been saved
    alert("Saved");
  };

  // Show loading indicator while fetching data
  if (loading) return <div>Loading...</div>;

  return (
    <div className="page-container py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-slate-800">User Settings</h2>
        <button
          onClick={() => navigate(-1)}
          className="btn btn-secondary"
        >
          Back
        </button>
      </div>
      <p className="text-sm text-slate-600 mb-4">Select all services you currently have access to.</p>

      <section className="panel">
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

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const next = appendMissingServices(streamingServices, AVAILABLE_STREAMING_SERVICES);
            setStreamingServices(next);
          }}
          className="btn btn-secondary text-sm px-3 py-1.5"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={() => {
            setStreamingServices([]);
          }}
          className="btn btn-secondary text-sm px-3 py-1.5"
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
          className="btn btn-secondary text-sm px-3 py-1.5"
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

      {/* Button to save changes */}
      <button
        onClick={handleSave}
        className="btn btn-primary"
      >
        Save
      </button>
      </section>
    </div>
  );
}
