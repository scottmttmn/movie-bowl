import { useNavigate } from "react-router-dom";
import useUserStreamingServices from "../hooks/useUserStreamingServices";
import { AVAILABLE_STREAMING_SERVICES } from "../utils/streamingServices";

export default function UserSettings() {
  const navigate = useNavigate();
  const { streamingServices, toggleService, loading, saveStreamingServices } =
    useUserStreamingServices();

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
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">User Settings</h2>
        <button
          onClick={() => navigate(-1)}
          className="px-3 py-2 rounded border border-gray-300 bg-white hover:bg-gray-50"
        >
          Back
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-4">Select all services you currently have access to.</p>

      {/* Render checkboxes for each streaming service */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
      {AVAILABLE_STREAMING_SERVICES.map((service) => (
        <label key={service} className="flex items-center gap-2 rounded border border-gray-200 px-3 py-2">
          <input
            type="checkbox"
            checked={streamingServices.includes(service)}
            onChange={() => toggleService(service)}
          />
          {service}
        </label>
      ))}
      </div>

      {/* Button to save changes */}
      <button
        onClick={handleSave}
        className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
      >
        Save
      </button>
    </div>
  );
}
