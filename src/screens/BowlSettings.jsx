import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

// Bowl-level settings screen.
// MVP scope: manage members + invites for a bowl.
// - Owner can create invite links by email.
// - Owner can remove non-owner members.
// - Members can view the membership list.
export default function BowlSettings() {
  const { bowlId } = useParams();
  const navigate = useNavigate();

  const [bowlName, setBowlName] = useState("Bowl Settings");
  const [editableBowlName, setEditableBowlName] = useState("Bowl Settings");
  const [ownerId, setOwnerId] = useState(null);

  const [members, setMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);

  const [emailToInvite, setEmailToInvite] = useState("");
  const [inviteLink, setInviteLink] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingName, setIsSavingName] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const [currentUserId, setCurrentUserId] = useState(null);

  const isOwner = useMemo(() => {
    return Boolean(ownerId && currentUserId && ownerId === currentUserId);
  }, [ownerId, currentUserId]);

  const loadBowlAndMembers = async () => {
    if (!bowlId) return;

    setIsLoading(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      // Who am I?
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) {
        console.error("[BowlSettings] Failed to get current user", authError);
      }
      setCurrentUserId(authData?.user?.id ?? null);

      // Load bowl basics (name + owner).
      const { data: bowl, error: bowlError } = await supabase
        .from("bowls")
        .select("id, name, owner_id")
        .eq("id", bowlId)
        .single();

      if (bowlError) {
        console.error("[BowlSettings] Failed to load bowl", bowlError);
        setErrorMessage("Failed to load bowl settings.");
        setIsLoading(false);
        return;
      }

      setBowlName(bowl?.name || "Bowl Settings");
      setEditableBowlName(bowl?.name || "Bowl Settings");
      setOwnerId(bowl?.owner_id ?? null);

      // Load members. Join to profiles so we can show emails.
      const { data: memberRows, error: membersError } = await supabase
        .from("bowl_members")
        .select("user_id, role, profiles:profiles(email)")
        .eq("bowl_id", bowlId)
        .order("role", { ascending: false });

      if (membersError) {
        console.error("[BowlSettings] Failed to load members", membersError);
        setErrorMessage("Failed to load bowl members.");
        setMembers([]);
        setIsLoading(false);
        return;
      }

      setMembers(memberRows || []);

      // Load pending invites (unaccepted) so the owner can copy/share links.
      const { data: invites, error: invitesError } = await supabase
        .from("bowl_invites")
        .select("id, invited_email, token, accepted_at, created_at")
        .eq("bowl_id", bowlId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });

      if (invitesError) {
        console.error("[BowlSettings] Failed to load pending invites", invitesError);
        setPendingInvites([]);
      } else {
        setPendingInvites(invites || []);
      }
    } catch (err) {
      console.error("[BowlSettings] Unexpected error", err);
      setErrorMessage("Unexpected error loading bowl settings.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBowlAndMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bowlId]);

  const handleCreateInvite = async (e) => {
    e.preventDefault();

    setActionMessage(null);
    setErrorMessage(null);
    setInviteLink(null);

    const email = emailToInvite.trim().toLowerCase();
    if (!email) return;

    try {
      // Create an invite row. The invited user accepts after they log in.
      const token = crypto.randomUUID();

      const { error: insertError } = await supabase.from("bowl_invites").insert([
        {
          bowl_id: bowlId,
          invited_email: email,
          invited_by: currentUserId,
          token,
        },
      ]);

      if (insertError) {
        console.error("[BowlSettings] Failed to create invite", insertError);
        setErrorMessage("Failed to create invite.");
        return;
      }

      const link = `${window.location.origin}/accept-invite/${token}`;
      setInviteLink(link);
      setEmailToInvite("");
      setActionMessage("Invite created. Share the link with your friend.");

      await loadBowlAndMembers();
    } catch (err) {
      console.error("[BowlSettings] Unexpected error creating invite", err);
      setErrorMessage("Unexpected error creating invite.");
    }
  };

  const handleRemoveMember = async (userIdToRemove) => {
    setActionMessage(null);
    setErrorMessage(null);

    try {
      const { error } = await supabase
        .from("bowl_members")
        .delete()
        .eq("bowl_id", bowlId)
        .eq("user_id", userIdToRemove);

      if (error) {
        console.error("[BowlSettings] Failed to remove member", error);
        setErrorMessage("Failed to remove member.");
        return;
      }

      setActionMessage("Member removed.");
      await loadBowlAndMembers();
    } catch (err) {
      console.error("[BowlSettings] Unexpected error removing member", err);
      setErrorMessage("Unexpected error removing member.");
    }
  };

  const handleRenameBowl = async (e) => {
    e.preventDefault();

    setActionMessage(null);
    setErrorMessage(null);

    const nextName = editableBowlName.trim();
    if (!nextName) {
      setErrorMessage("Bowl name cannot be empty.");
      return;
    }

    if (nextName === bowlName) {
      setActionMessage("Bowl name is already up to date.");
      return;
    }

    setIsSavingName(true);

    try {
      const { error } = await supabase
        .from("bowls")
        .update({ name: nextName })
        .eq("id", bowlId);

      if (error) {
        console.error("[BowlSettings] Failed to rename bowl", error);
        setErrorMessage("Failed to update bowl name.");
        return;
      }

      setBowlName(nextName);
      setEditableBowlName(nextName);
      setActionMessage("Bowl name updated.");
    } catch (err) {
      console.error("[BowlSettings] Unexpected error renaming bowl", err);
      setErrorMessage("Unexpected error updating bowl name.");
    } finally {
      setIsSavingName(false);
    }
  };

  return (
    <div className="page-container py-4">
      <header className="flex items-center justify-between mb-4">
        <button onClick={() => navigate(`/bowl/${bowlId}`)} className="btn btn-ghost px-3 py-2">
          Back
        </button>
        <h2 className="text-2xl font-semibold text-slate-800 truncate max-w-[70%]">{bowlName}</h2>
        <div />
      </header>

      {isLoading && <div className="text-sm text-gray-600">Loading…</div>}
      {!isLoading && errorMessage && (
        <div className="text-sm text-red-600 mb-2">{errorMessage}</div>
      )}
      {!isLoading && actionMessage && (
        <div className="text-sm text-green-700 mb-2">{actionMessage}</div>
      )}

      {isOwner && (
        <section className="panel mb-4">
          <h3 className="section-title mb-3">Bowl Name</h3>
          <form onSubmit={handleRenameBowl} className="flex gap-2">
            <input
              id="bowl-name-input"
              name="bowl_name"
              type="text"
              value={editableBowlName}
              onChange={(e) => setEditableBowlName(e.target.value)}
              className="input-field flex-1"
              maxLength={120}
            />
            <button
              type="submit"
              disabled={isSavingName}
              className="btn btn-secondary disabled:opacity-60"
            >
              {isSavingName ? "Saving..." : "Save"}
            </button>
          </form>
        </section>
      )}

      <section className="panel">
        <h3 className="section-title mb-3">Members</h3>

        {!isOwner && (
          <p className="text-sm text-gray-600 mb-3">
            Only the bowl owner can invite or remove members.
          </p>
        )}

        {isOwner && (
          <form onSubmit={handleCreateInvite} className="flex gap-2 mb-4">
            <input
              id="invite-email-input"
              name="invite_email"
              type="email"
              value={emailToInvite}
              onChange={(e) => setEmailToInvite(e.target.value)}
              placeholder="friend@example.com"
              className="input-field flex-1"
            />
            <button
              type="submit"
              className="btn btn-secondary"
            >
              Invite
            </button>
          </form>
        )}

        {isOwner && inviteLink && (
          <div className="mb-4 rounded-lg border border-slate-200 p-3 bg-slate-50">
            <div className="text-xs text-slate-600 mb-1">Invite link</div>
            <div className="flex items-center gap-2">
              <input
                id="invite-link-input"
                name="invite_link"
                readOnly
                value={inviteLink}
                className="input-field flex-1 text-xs"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteLink);
                    setActionMessage("Invite link copied.");
                  } catch (err) {
                    console.error("[BowlSettings] Failed to copy invite link", err);
                  }
                }}
                className="btn btn-secondary text-sm px-3 py-2"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {isOwner && pendingInvites.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold mb-2">Pending Invites</h4>
            <div className="space-y-2">
              {pendingInvites.map((inv) => {
                const link = `${window.location.origin}/accept-invite/${inv.token}`;
                return (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{inv.invited_email}</div>
                      <div className="text-xs text-gray-600">Not accepted yet</div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(link);
                          setActionMessage("Invite link copied.");
                        } catch (err) {
                          console.error("[BowlSettings] Failed to copy invite link", err);
                        }
                      }}
                      className="btn btn-secondary text-sm px-2 py-1"
                    >
                      Copy
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {members.length === 0 ? (
            <div className="text-sm text-gray-600">No members found.</div>
          ) : (
            members.map((m) => {
              const email = m.profiles?.email || m.user_id;
              const isOwnerRole = m.role === "Owner";

              return (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{email}</div>
                    <div className="text-xs text-gray-600">{m.role}</div>
                  </div>

                  {isOwner && !isOwnerRole && (
                    <button
                      onClick={() => handleRemoveMember(m.user_id)}
                      className="btn btn-secondary text-sm px-2 py-1"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
