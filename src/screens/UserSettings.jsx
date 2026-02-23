import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AVAILABLE_STREAMING_SERVICES, uniqueNormalizedServices } from "../utils/streamingServices";

export default function UserSettings() {
  const navigate = useNavigate();
  // State to hold the user's selected streaming services
  const [streamingServices, setStreamingServices] = useState([]);
  // State to manage loading status
  const [loading, setLoading] = useState(true);

  // useEffect to fetch user profile data on component mount
  useEffect(() => {
    const fetchProfile = async () => {
      // Get the currently authenticated user
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;

      // Fetch the user's profile from the "profiles" table
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      // If data is returned without error, update state
      if (!error && data) {
        setStreamingServices(uniqueNormalizedServices(data.streaming_services || []));
      }

      // Set loading to false after fetching data
      setLoading(false);
    };

    fetchProfile();
  }, []);

  // Function to save the updated streaming services to the database
  const handleSave = async () => {
    // Get the currently authenticated user
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    // Update the user's profile with the new streaming services
    await supabase
      .from("profiles")
      .update({ streaming_services: uniqueNormalizedServices(streamingServices) })
      .eq("id", user.id);

    // Notify the user that their changes have been saved
    alert("Saved");
  };

  // Function to toggle a streaming service in the user's selection
  const toggleService = (service) => {
    setStreamingServices((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service) // Remove service if already selected
        : [...prev, service] // Add service if not selected
    );
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
