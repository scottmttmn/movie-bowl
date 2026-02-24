import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { parseInviteEmails } from "../utils/parseInviteEmails";

// Bowl-level settings screen.
// MVP scope: manage members + invites for a bowl.
// - Owner can create invite links by email.
// - Owner can remove non-owner members.
// - Members can view the membership list.
export default function BowlSettings() {
  const { bowlId } = useParams();
  const navigate = useNavigate();

  const [bowlName, setBowlName] = useState("Bowl Settings");
  const [bowlMaxContributionLead, setBowlMaxContributionLead] = useState(null);
  const [editableBowlName, setEditableBowlName] = useState("Bowl Settings");
  const [editableMaxContributionLead, setEditableMaxContributionLead] = useState("");
  const [ownerId, setOwnerId] = useState(null);

  const [members, setMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);

  const [emailToInvite, setEmailToInvite] = useState("");
  const [inviteLink, setInviteLink] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingName, setIsSavingName] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingBowl, setIsDeletingBowl] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState("");

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
      setCurrentUserEmail((authData?.user?.email || "").toLowerCase());

      // Load bowl basics (name + owner).
      const { data: bowl, error: bowlError } = await supabase
        .from("bowls")
        .select("id, name, owner_id, max_contribution_lead")
        .eq("id", bowlId)
        .single();

      if (bowlError) {
        console.error("[BowlSettings] Failed to load bowl", bowlError);
        setErrorMessage("Failed to load bowl settings.");
        setIsLoading(false);
        return;
      }

      setBowlName(bowl?.name || "Bowl Settings");
      setBowlMaxContributionLead(
        Number.isFinite(Number(bowl?.max_contribution_lead))
          ? Number(bowl.max_contribution_lead)
          : null
      );
      setEditableBowlName(bowl?.name || "Bowl Settings");
      setEditableMaxContributionLead(
        Number.isFinite(Number(bowl?.max_contribution_lead))
          ? String(Number(bowl.max_contribution_lead))
          : ""
      );
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

    const { validEmails, invalidEmails } = parseInviteEmails(emailToInvite);
    if (invalidEmails.length > 0) {
      setErrorMessage(`Invalid email: ${invalidEmails[0]}`);
      return;
    }

    if (validEmails.length === 0) return;
    if (validEmails.length > 1) {
      setErrorMessage("Please enter one email at a time.");
      return;
    }

    const email = validEmails[0];

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

  const handleRevokeInvite = async (inviteId, invitedEmail) => {
    setActionMessage(null);
    setErrorMessage(null);

    if (!isOwner) {
      setErrorMessage("Only the bowl owner can revoke invites.");
      return;
    }

    try {
      const { error } = await supabase
        .from("bowl_invites")
        .delete()
        .eq("id", inviteId)
        .eq("bowl_id", bowlId);

      if (error) {
        console.error("[BowlSettings] Failed to revoke invite", error);
        setErrorMessage("Failed to revoke invite.");
        return;
      }

      setActionMessage(`Invite revoked for ${invitedEmail}.`);
      await loadBowlAndMembers();
    } catch (err) {
      console.error("[BowlSettings] Unexpected error revoking invite", err);
      setErrorMessage("Unexpected error revoking invite.");
    }
  };

  const handleSaveBowlMeta = async (e) => {
    e.preventDefault();

    setActionMessage(null);
    setErrorMessage(null);

    const nextName = editableBowlName.trim();
    if (!nextName) {
      setErrorMessage("Bowl name cannot be empty.");
      return;
    }

    const leadInput = editableMaxContributionLead.trim();
    let nextMaxLead = null;
    if (leadInput !== "") {
      const parsedLead = Number(leadInput);
      if (!Number.isInteger(parsedLead) || parsedLead < 1) {
        setErrorMessage("Max contribution lead must be a whole number 1 or greater.");
        return;
      }
      nextMaxLead = parsedLead;
    }

    if (nextName === bowlName && nextMaxLead === bowlMaxContributionLead) {
      setActionMessage("Bowl settings are already up to date.");
      return;
    }

    setIsSavingName(true);

    try {
      const { error } = await supabase
        .from("bowls")
        .update({ name: nextName, max_contribution_lead: nextMaxLead })
        .eq("id", bowlId);

      if (error) {
        console.error("[BowlSettings] Failed to rename bowl", error);
        setErrorMessage("Failed to update bowl name.");
        return;
      }

      setBowlName(nextName);
      setBowlMaxContributionLead(nextMaxLead);
      setEditableBowlName(nextName);
      setEditableMaxContributionLead(nextMaxLead === null ? "" : String(nextMaxLead));
      setActionMessage("Bowl settings updated.");
    } catch (err) {
      console.error("[BowlSettings] Unexpected error renaming bowl", err);
      setErrorMessage("Unexpected error updating bowl settings.");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleDeleteBowl = async (e) => {
    e.preventDefault();
    setActionMessage(null);
    setErrorMessage(null);

    if (!isOwner) {
      setErrorMessage("Only the bowl owner can delete this bowl.");
      return;
    }

    if (deleteConfirmText.trim() !== "DELETE") {
      setErrorMessage('Type "DELETE" to confirm bowl deletion.');
      return;
    }

    setIsDeletingBowl(true);

    try {
      const { error: moviesError } = await supabase
        .from("bowl_movies")
        .delete()
        .eq("bowl_id", bowlId);
      if (moviesError) {
        console.error("[BowlSettings] Failed to delete bowl movies", moviesError);
        setErrorMessage("Failed to delete bowl movies.");
        return;
      }

      const { error: invitesError } = await supabase
        .from("bowl_invites")
        .delete()
        .eq("bowl_id", bowlId);
      if (invitesError) {
        console.error("[BowlSettings] Failed to delete bowl invites", invitesError);
        setErrorMessage("Failed to delete bowl invites.");
        return;
      }

      const { error: membersError } = await supabase
        .from("bowl_members")
        .delete()
        .eq("bowl_id", bowlId);
      if (membersError) {
        console.error("[BowlSettings] Failed to delete bowl members", membersError);
        setErrorMessage("Failed to delete bowl members.");
        return;
      }

      const { error: bowlError } = await supabase
        .from("bowls")
        .delete()
        .eq("id", bowlId);
      if (bowlError) {
        console.error("[BowlSettings] Failed to delete bowl", bowlError);
        setErrorMessage("Failed to delete bowl.");
        return;
      }

      navigate("/", { replace: true });
    } catch (err) {
      console.error("[BowlSettings] Unexpected error deleting bowl", err);
      setErrorMessage("Unexpected error deleting bowl.");
    } finally {
      setIsDeletingBowl(false);
    }
  };

  const handleLeaveBowl = async () => {
    setActionMessage(null);
    setErrorMessage(null);

    if (!currentUserId || !bowlId) return;
    if (isOwner) {
      setErrorMessage("Owners cannot leave the bowl. Transfer ownership or delete the bowl.");
      return;
    }

    const confirmed = window.confirm("Leave this bowl?");
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("bowl_members")
        .delete()
        .eq("bowl_id", bowlId)
        .eq("user_id", currentUserId);

      if (error) {
        console.error("[BowlSettings] Failed to leave bowl", error);
        setErrorMessage(`Failed to leave bowl: ${error.message || "unknown error"}`);
        return;
      }

      // Verify membership is truly gone (delete metadata can be ambiguous with RLS/returning settings).
      const { data: membershipAfterDelete, error: verifyError } = await supabase
        .from("bowl_members")
        .select("user_id")
        .eq("bowl_id", bowlId)
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (verifyError) {
        console.error("[BowlSettings] Failed to verify leave result", verifyError);
        setErrorMessage(`Failed to verify leave result: ${verifyError.message || "unknown error"}`);
        return;
      }

      if (membershipAfterDelete) {
        setErrorMessage("Could not leave bowl. Your membership row still exists. Ask the owner to remove you or update RLS policy.");
        return;
      }

      // Cleanup accepted/pending invites for this user email to avoid stale list behavior.
      if (currentUserEmail) {
        const { error: inviteDeleteError } = await supabase
          .from("bowl_invites")
          .delete()
          .eq("bowl_id", bowlId)
          .eq("invited_email", currentUserEmail);

        if (inviteDeleteError) {
          console.error("[BowlSettings] Failed to remove invite rows after leaving", inviteDeleteError);
        }
      }

      navigate("/", { replace: true });
    } catch (err) {
      console.error("[BowlSettings] Unexpected error leaving bowl", err);
      setErrorMessage("Unexpected error leaving bowl.");
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
          <form onSubmit={handleSaveBowlMeta} className="space-y-3">
            <div className="flex gap-2">
              <input
                id="bowl-name-input"
                name="bowl_name"
                type="text"
                value={editableBowlName}
                onChange={(e) => setEditableBowlName(e.target.value)}
                className="input-field flex-1"
                maxLength={120}
              />
            </div>
            <div>
              <label htmlFor="bowl-max-contribution-lead" className="mb-1 block text-sm text-slate-700">
                Max contribution lead (blank = no limit)
              </label>
              <input
                id="bowl-max-contribution-lead"
                name="bowl_max_contribution_lead"
                type="number"
                min="1"
                step="1"
                value={editableMaxContributionLead}
                onChange={(e) => setEditableMaxContributionLead(e.target.value)}
                className="input-field w-40"
              />
            </div>
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

      {isOwner && (
        <section className="panel mb-4 border-red-200">
          <h3 className="section-title mb-2 text-red-700">Delete Bowl</h3>
          <p className="text-sm text-slate-600 mb-3">
            This permanently deletes the bowl, all bowl movies, members, and pending invites.
          </p>
          <form onSubmit={handleDeleteBowl} className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              id="delete-bowl-confirm"
              name="delete_bowl_confirm"
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder='Type "DELETE"'
              className="input-field sm:flex-1"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={isDeletingBowl}
              className="btn border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 focus-visible:ring-red-200 disabled:opacity-60"
            >
              {isDeletingBowl ? "Deleting..." : "Delete Bowl"}
            </button>
          </form>
        </section>
      )}

      {!isOwner && (
        <section className="panel mb-4 border-amber-200">
          <h3 className="section-title mb-2 text-amber-700">Leave Bowl</h3>
          <p className="text-sm text-slate-600 mb-3">
            You will be removed from this bowl and can rejoin only by invite.
          </p>
          <button
            type="button"
            onClick={handleLeaveBowl}
            className="btn border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 focus-visible:ring-amber-200"
          >
            Leave Bowl
          </button>
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
                    <button
                      type="button"
                      onClick={() => {
                        void handleRevokeInvite(inv.id, inv.invited_email);
                      }}
                      className="btn border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-700 hover:bg-red-100 focus-visible:ring-red-200"
                    >
                      Revoke
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
