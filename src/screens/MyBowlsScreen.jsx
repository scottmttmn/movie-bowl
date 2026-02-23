import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BowlCard from "../components/BowlCard";
import NewBowlButton from "../components/NewBowlButton";
import { supabase } from "../lib/supabase";

// Supabase client is centralized in src/lib/supabase.js

export default function MyBowlsScreen() {
  // Bowls shown on the home screen. Loaded from Supabase for the logged-in user.
  const [bowls, setBowls] = useState([]);

  // Simple loading flag so we can avoid flashing mock content.
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newBowlName, setNewBowlName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // Load bowls the user owns, plus bowls they are a member of.
    const loadBowls = async () => {
      setIsLoading(true);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      const user = authData?.user;

      if (authError || !user) {
        // If the user is not authenticated, show an empty list.
        setBowls([]);
        setIsLoading(false);
        return;
      }

      // Load bowls + counts from a single RPC.
      // This avoids client-side counting quirks with RLS and keeps the home screen fast.
      const { data: rows, error: bowlsError } = await supabase.rpc(
        "get_my_bowls_with_counts"
      );

      if (bowlsError) {
        console.error("Failed to load bowls", bowlsError);
        setBowls([]);
        setIsLoading(false);
        return;
      }

      setBowls(
        (rows || []).map((b) => ({
          id: b.id,
          name: b.name,
          remainingCount: Number(b.remaining_count || 0),
          memberCount: Number(b.member_count || 0),
          role: b.owner_id === user.id ? "Owner" : "Member",
        }))
      );

      setIsLoading(false);
      return;
    };

    loadBowls();
  }, []);

  const handleSelectBowl = (bowlId) => {
    navigate(`/bowl/${bowlId}`);
  };

  const handleNewBowl = () => {
    setIsModalOpen(true);
  };

  const handleCreateBowl = async () => {
    if (newBowlName.trim() === "") return;

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("Not authenticated", userError);
      return;
    }

    // Insert new bowl into Supabase
    const { data: newBowl, error: bowlError } = await supabase
      .from("bowls")
      .insert([{ owner_id:user.id ,name: newBowlName.trim() }])
      .select()
      .single();

    if (bowlError || !newBowl) {
      console.error("Failed to create bowl", bowlError);
      return;
    }

    // Insert bowl member as owner
    const { error: memberError } = await supabase
      .from("bowl_members")
      .insert([{ bowl_id: newBowl.id, user_id: user.id, role: "Owner" }]);

    if (memberError) {
      console.error("Failed to add owner membership", memberError);
      return;
    }

    // Update local state with new bowl
    const bowlToAdd = {
      id: newBowl.id,
      name: newBowl.name,
      remainingCount: 0,
      memberCount: 1,
      role: "Owner",
    };
    setBowls((prev) => [...prev,bowlToAdd]);
    setNewBowlName("");
    setIsModalOpen(false);
  };

  const handleCloseModal = () => {
    setNewBowlName("");
    setIsModalOpen(false);
  };

  return (
    <div className="my-bowls-screen p-6 max-w-3xl mx-auto">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold mb-3">My Bowls</h2>
        <div className="flex justify-start">
          <NewBowlButton onClick={handleNewBowl} />
        </div>
      </header>
      <div className="bowl-list space-y-4">
        {isLoading ? (
          <div className="text-sm text-gray-600">Loading bowls…</div>
        ) : bowls.length === 0 ? (
          <div className="text-sm text-gray-600">No bowls yet. Create one to get started.</div>
        ) : (
          bowls.map((b) => (
            <BowlCard key={b.id} bowl={b} onSelect={handleSelectBowl} />
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white rounded-lg p-6 w-80 shadow-lg">
            <h3 className="text-lg font-semibold mb-4">Create New Bowl</h3>
            <input
              type="text"
              className="w-full border border-gray-300 rounded px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Bowl Name"
              value={newBowlName}
              onChange={(e) => setNewBowlName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBowl(); }}
              autoFocus
            />
            <div className="flex justify-end space-x-3">
              <button
                className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400"
                onClick={handleCloseModal}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                onClick={handleCreateBowl}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}