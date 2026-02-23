import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BowlCard from "../components/BowlCard";
import NewBowlButton from "../components/NewBowlButton";
import { supabase } from "../lib/supabase";
import { parseInviteEmails } from "../utils/parseInviteEmails";

// Supabase client is centralized in src/lib/supabase.js

export default function MyBowlsScreen() {
  // Bowls shown on the home screen. Loaded from Supabase for the logged-in user.
  const [bowls, setBowls] = useState([]);

  // Simple loading flag so we can avoid flashing mock content.
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newBowlName, setNewBowlName] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");
  const [createErrorMessage, setCreateErrorMessage] = useState(null);
  const [createActionMessage, setCreateActionMessage] = useState(null);
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

      // Determine access from authoritative ownership + membership tables.
      const [{ data: ownedRows, error: ownedError }, { data: memberRows, error: memberError }] =
        await Promise.all([
          supabase.from("bowls").select("id").eq("owner_id", user.id),
          supabase.from("bowl_members").select("bowl_id").eq("user_id", user.id),
        ]);

      if (ownedError || memberError) {
        console.error("Failed to load user bowl access", ownedError || memberError);
        setBowls([]);
        setIsLoading(false);
        return;
      }

      const allowedBowlIds = new Set([
        ...(ownedRows || []).map((row) => row.id),
        ...(memberRows || []).map((row) => row.bowl_id),
      ]);

      if (allowedBowlIds.size === 0) {
        setBowls([]);
        setIsLoading(false);
        return;
      }

      // Load bowl cards + counts from RPC, then filter to only accessible bowls.
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
        (rows || [])
          .filter((b) => allowedBowlIds.has(b.id))
          .map((b) => ({
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
    setCreateErrorMessage(null);
    setCreateActionMessage(null);
    setIsModalOpen(true);
  };

  const handleCreateBowl = async () => {
    setCreateErrorMessage(null);
    setCreateActionMessage(null);

    const bowlName = newBowlName.trim();
    if (!bowlName) {
      setCreateErrorMessage("Bowl name is required.");
      return;
    }

    const { validEmails, invalidEmails } = parseInviteEmails(inviteEmails);
    if (invalidEmails.length > 0) {
      setCreateErrorMessage(`Invalid email(s): ${invalidEmails.join(", ")}`);
      return;
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("Not authenticated", userError);
      setCreateErrorMessage("You must be signed in to create a bowl.");
      return;
    }

    // Insert new bowl into Supabase
    const { data: newBowl, error: bowlError } = await supabase
      .from("bowls")
      .insert([{ owner_id:user.id ,name: bowlName }])
      .select()
      .single();

    if (bowlError || !newBowl) {
      console.error("Failed to create bowl", bowlError);
      setCreateErrorMessage("Failed to create bowl.");
      return;
    }

    // Insert bowl member as owner
    const { error: memberError } = await supabase
      .from("bowl_members")
      .insert([{ bowl_id: newBowl.id, user_id: user.id, role: "Owner" }]);

    if (memberError) {
      console.error("Failed to add owner membership", memberError);
      setCreateErrorMessage("Failed to add owner membership.");
      return;
    }

    if (validEmails.length > 0) {
      const inviteRows = validEmails.map((email) => ({
        bowl_id: newBowl.id,
        invited_email: email,
        invited_by: user.id,
        token: crypto.randomUUID(),
      }));

      const { error: inviteError } = await supabase
        .from("bowl_invites")
        .insert(inviteRows);

      if (inviteError) {
        console.error("Failed to create invites", inviteError);
        setCreateErrorMessage("Bowl created, but invites could not be created.");
      } else {
        setCreateActionMessage(
          `Bowl created with ${validEmails.length} invite${validEmails.length === 1 ? "" : "s"}.`
        );
      }
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
    setInviteEmails("");
    setIsModalOpen(false);
  };

  const handleCloseModal = () => {
    setNewBowlName("");
    setInviteEmails("");
    setCreateErrorMessage(null);
    setCreateActionMessage(null);
    setIsModalOpen(false);
  };

  return (
    <div className="my-bowls-screen page-container py-4">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold text-slate-800 mb-3">My Bowls</h2>
        {createErrorMessage && <div className="mb-3 text-sm text-red-600">{createErrorMessage}</div>}
        {createActionMessage && <div className="mb-3 text-sm text-green-700">{createActionMessage}</div>}
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
          <div className="panel w-full max-w-sm">
            <h3 className="section-title mb-4">Create New Bowl</h3>
            <input
              id="new-bowl-name"
              name="new_bowl_name"
              type="text"
              className="input-field mb-4"
              placeholder="Bowl Name"
              value={newBowlName}
              onChange={(e) => setNewBowlName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBowl(); }}
              autoFocus
            />
            <label htmlFor="new-bowl-invites" className="mb-1 block text-sm font-medium text-slate-700">
              Invite emails (optional)
            </label>
            <textarea
              id="new-bowl-invites"
              name="new_bowl_invites"
              className="input-field mb-4 min-h-20"
              placeholder="friend1@example.com, friend2@example.com"
              value={inviteEmails}
              onChange={(e) => setInviteEmails(e.target.value)}
            />
            <div className="flex justify-end space-x-3">
              <button
                className="btn btn-secondary"
                onClick={handleCloseModal}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
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
