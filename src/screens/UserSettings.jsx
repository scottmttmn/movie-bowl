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
  const { streamingServices, toggleService, loading, saveStreamingServices } =
    useUserStreamingServices();

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
            AVAILABLE_STREAMING_SERVICES.forEach((service) => {
              if (!streamingServices.includes(service)) toggleService(service);
            });
          }}
          className="btn btn-secondary text-sm px-3 py-1.5"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={() => {
            streamingServices.forEach((service) => toggleService(service));
          }}
          className="btn btn-secondary text-sm px-3 py-1.5"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => {
            const nextSelected = MAJOR_STREAMING_SERVICES.filter((service) =>
              streamingServices.includes(service)
            );
            streamingServices.forEach((service) => {
              if (!nextSelected.includes(service)) toggleService(service);
            });
            MAJOR_STREAMING_SERVICES.forEach((service) => {
              if (!streamingServices.includes(service)) toggleService(service);
            });
          }}
          className="btn btn-secondary text-sm px-3 py-1.5"
        >
          Only major
        </button>
      </div>

      {streamingServices.length > 0 && (
        <div className="mb-5">
          <p className="text-sm font-medium text-slate-700 mb-2">Selected services</p>
          <div className="flex flex-wrap gap-2">
            {streamingServices.map((service) => (
              <button
                key={service}
                type="button"
                onClick={() => toggleService(service)}
                className="inline-flex items-center gap-2 rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-sm font-medium"
              >
                {service}
                <span aria-hidden="true">×</span>
              </button>
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
