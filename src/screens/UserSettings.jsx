import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function UserSettings() {
  // State to hold the user's profile data
  const [profile, setProfile] = useState(null);
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
        setProfile(data);
        setStreamingServices(data.streaming_services || []);
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
      .update({ streaming_services: streamingServices })
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
    <div>
      <h2>User Settings</h2>

      {/* Render checkboxes for each streaming service */}
      {["Netflix", "Hulu", "Disney+", "Prime Video"].map((service) => (
        <label key={service} style={{ display: "block" }}>
          <input
            type="checkbox"
            checked={streamingServices.includes(service)}
            onChange={() => toggleService(service)}
          />
          {service}
        </label>
      ))}

      {/* Button to save changes */}
      <button onClick={handleSave}>Save</button>
    </div>
  );
}