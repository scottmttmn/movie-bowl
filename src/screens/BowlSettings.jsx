import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { sendInviteEmails } from "../lib/inviteEmails";
import { supabase } from "../lib/supabase";
import { parseInviteEmails } from "../utils/parseInviteEmails";

// Bowl-level settings screen.
// MVP scope: manage members + invites for a bowl.
// - Owner can create invite links by email.
// - Owner can remove non-owner members.
// - Members can view the membership list.
export default function BowlSettings() {
  const DRAW_ACCESS_MODE_ALL = "all_members";
  const DRAW_ACCESS_MODE_SELECTED = "selected_members";

  const { bowlId } = useParams();
  const navigate = useNavigate();

  const [bowlName, setBowlName] = useState("Bowl Settings");
  const [bowlMaxContributionLead, setBowlMaxContributionLead] = useState(null);
  const [drawAccessMode, setDrawAccessMode] = useState(DRAW_ACCESS_MODE_ALL);
  const [drawAllowedUserIds, setDrawAllowedUserIds] = useState([]);
  const [editableBowlName, setEditableBowlName] = useState("Bowl Settings");
  const [editableMaxContributionLead, setEditableMaxContributionLead] = useState("");
  const [ownerId, setOwnerId] = useState(null);

  const [members, setMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [addLinks, setAddLinks] = useState([]);

  const [emailToInvite, setEmailToInvite] = useState("");
  const [inviteLink, setInviteLink] = useState(null);
  const [newAddLinkMaxAdds, setNewAddLinkMaxAdds] = useState("3");
  const [newAddLinkDefaultContributorName, setNewAddLinkDefaultContributorName] = useState("");
  const [generatedAddLink, setGeneratedAddLink] = useState(null);
  const [editingAddLinkNames, setEditingAddLinkNames] = useState({});

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSavingDrawAccess, setIsSavingDrawAccess] = useState(false);
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
      const isMissingDrawAccessColumn = (error) =>
        String(error?.message || "").toLowerCase().includes("draw_access_mode");
      const isMissingDrawPermissionsTable = (error) => {
        const text = String(error?.message || "").toLowerCase();
        return text.includes("bowl_draw_permissions") && text.includes("does not exist");
      };
      const isMissingAddLinksTable = (error) => {
        const text = String(error?.message || "").toLowerCase();
        return text.includes("bowl_add_links") && text.includes("does not exist");
      };

      // Who am I?
      const { data: authData, error: authError } = await supabase.auth.getSession();
      if (authError) {
        console.error("[BowlSettings] Failed to get current user", authError);
      }
      setCurrentUserId(authData?.session?.user?.id ?? null);
      setCurrentUserEmail((authData?.session?.user?.email || "").toLowerCase());

      // Load bowl basics (name + owner).
      let { data: bowl, error: bowlError } = await supabase
        .from("bowls")
        .select("id, name, owner_id, max_contribution_lead, draw_access_mode")
        .eq("id", bowlId)
        .single();

      if (bowlError && isMissingDrawAccessColumn(bowlError)) {
        const fallback = await supabase
          .from("bowls")
          .select("id, name, owner_id, max_contribution_lead")
          .eq("id", bowlId)
          .single();
        bowl = fallback.data;
        bowlError = fallback.error;
      }

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
      setDrawAccessMode(
        bowl?.draw_access_mode === DRAW_ACCESS_MODE_SELECTED
          ? DRAW_ACCESS_MODE_SELECTED
          : DRAW_ACCESS_MODE_ALL
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

      const { data: permissionRows, error: permissionsError } = await supabase
        .from("bowl_draw_permissions")
        .select("user_id")
        .eq("bowl_id", bowlId);

      if (permissionsError) {
        if (!isMissingDrawPermissionsTable(permissionsError)) {
          console.error("[BowlSettings] Failed to load draw permissions", permissionsError);
        }
        setDrawAllowedUserIds([]);
      } else {
        setDrawAllowedUserIds((permissionRows || []).map((row) => row.user_id).filter(Boolean));
      }

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

      const { data: addLinkRows, error: addLinksError } = await supabase
        .from("bowl_add_links")
        .select("id, token, max_adds, adds_used, revoked_at, created_at, created_by, default_contributor_name")
        .eq("bowl_id", bowlId)
        .order("created_at", { ascending: false });

      if (addLinksError) {
        if (!isMissingAddLinksTable(addLinksError)) {
          console.error("[BowlSettings] Failed to load add links", addLinksError);
          setErrorMessage("Failed to load bowl add links.");
        }
        setAddLinks([]);
      } else {
        setAddLinks(addLinkRows || []);
        setEditingAddLinkNames(
          Object.fromEntries(
            (addLinkRows || []).map((row) => [row.id, row.default_contributor_name || ""])
          )
        );
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
    setGeneratedAddLink(null);

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

      await loadBowlAndMembers();

      const emailResult = await sendInviteEmails([
        {
          bowlId,
          bowlName,
          invitedEmail: email,
          invitedByEmail: currentUserEmail || null,
          token,
        },
      ]);

      if (!emailResult.error && emailResult.failed === 0) {
        setActionMessage("Invite created and email sent.");
      } else {
        setActionMessage("Invite created, but email could not be sent. You can still copy the link.");
      }
    } catch (err) {
      console.error("[BowlSettings] Unexpected error creating invite", err);
      setErrorMessage("Unexpected error creating invite.");
    }
  };

  const handleCreateAddLink = async (event) => {
    event.preventDefault();

    setActionMessage(null);
    setErrorMessage(null);
    setInviteLink(null);
    setGeneratedAddLink(null);

    const parsedMaxAdds = Number.parseInt(newAddLinkMaxAdds, 10);
    if (!Number.isInteger(parsedMaxAdds) || parsedMaxAdds < 1) {
      setErrorMessage("Enter a valid number of allowed adds.");
      return;
    }

    try {
      const token = crypto.randomUUID();
      const { error } = await supabase.from("bowl_add_links").insert([
        {
          bowl_id: bowlId,
          created_by: currentUserId,
          token,
          max_adds: parsedMaxAdds,
          default_contributor_name: newAddLinkDefaultContributorName.trim() || null,
        },
      ]);

      if (error) {
        console.error("[BowlSettings] Failed to create add link", error);
        setErrorMessage("Failed to create add link.");
        return;
      }

      const link = `${window.location.origin}/add-to-bowl/${token}`;
      setGeneratedAddLink(link);
      setNewAddLinkDefaultContributorName("");
      setActionMessage("Add link created.");
      await loadBowlAndMembers();
    } catch (err) {
      console.error("[BowlSettings] Unexpected error creating add link", err);
      setErrorMessage("Unexpected error creating add link.");
    }
  };

  const handleRevokeAddLink = async (linkId) => {
    setActionMessage(null);
    setErrorMessage(null);

    try {
      const { error } = await supabase
        .from("bowl_add_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", linkId)
        .is("revoked_at", null);

      if (error) {
        console.error("[BowlSettings] Failed to revoke add link", error);
        setErrorMessage("Failed to revoke add link.");
        return;
      }

      await loadBowlAndMembers();
      setActionMessage("Add link revoked.");
    } catch (err) {
      console.error("[BowlSettings] Unexpected error revoking add link", err);
      setErrorMessage("Unexpected error revoking add link.");
    }
  };

  const handleSaveAddLinkName = async (linkId) => {
    setActionMessage(null);
    setErrorMessage(null);

    try {
      const nextName = String(editingAddLinkNames[linkId] || "").trim();
      const { error } = await supabase
        .from("bowl_add_links")
        .update({ default_contributor_name: nextName || null })
        .eq("id", linkId);

      if (error) {
        console.error("[BowlSettings] Failed to save add link label", error);
        setErrorMessage("Failed to save add link label.");
        return;
      }

      await loadBowlAndMembers();
      setActionMessage("Add link label updated.");
    } catch (err) {
      console.error("[BowlSettings] Unexpected error saving add link label", err);
      setErrorMessage("Unexpected error saving add link label.");
    }
  };

  const buildAddLinkUrl = (token) => `${window.location.origin}/add-to-bowl/${token}`;

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

    const leadChanged = nextMaxLead !== bowlMaxContributionLead;

    if (nextName === bowlName && !leadChanged) {
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

      let refreshWarning = null;
      if (leadChanged) {
        const { error: refreshError } = await supabase.rpc("refresh_bowl_queue_promotions", {
          p_bowl_id: bowlId,
        });
        if (refreshError) {
          const message = String(refreshError?.message || "").toLowerCase();
          const isMissingRefreshFunction =
            refreshError?.code === "42883" ||
            (message.includes("refresh_bowl_queue_promotions") && message.includes("does not exist"));
          if (isMissingRefreshFunction) {
            refreshWarning =
              "Bowl settings updated. Queue refresh is unavailable until the latest database migration is applied.";
          } else {
            console.error("[BowlSettings] Failed to refresh queue promotions", refreshError);
            refreshWarning =
              "Bowl settings updated. Queue promotions may take a moment to appear.";
          }
        }
      }

      setBowlName(nextName);
      setBowlMaxContributionLead(nextMaxLead);
      setEditableBowlName(nextName);
      setEditableMaxContributionLead(nextMaxLead === null ? "" : String(nextMaxLead));
      setActionMessage(refreshWarning || "Bowl settings updated.");
    } catch (err) {
      console.error("[BowlSettings] Unexpected error renaming bowl", err);
      setErrorMessage("Unexpected error updating bowl settings.");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSaveDrawAccess = async (e) => {
    e.preventDefault();
    setActionMessage(null);
    setErrorMessage(null);

    if (!isOwner) {
      setErrorMessage("Only the bowl owner can update draw access.");
      return;
    }

    const nextMode =
      drawAccessMode === DRAW_ACCESS_MODE_SELECTED ? DRAW_ACCESS_MODE_SELECTED : DRAW_ACCESS_MODE_ALL;
    const allowedMemberIdSet = new Set(
      members
        .map((member) => member?.user_id)
        .filter((id) => Boolean(id && id !== ownerId))
    );
    const nextAllowedUserIds = [...new Set(drawAllowedUserIds)].filter((id) => allowedMemberIdSet.has(id));

    setIsSavingDrawAccess(true);
    try {
      const isMissingDrawAccessColumn = (error) =>
        String(error?.message || "").toLowerCase().includes("draw_access_mode");
      const isMissingDrawPermissionsTable = (error) => {
        const text = String(error?.message || "").toLowerCase();
        return text.includes("bowl_draw_permissions") && text.includes("does not exist");
      };

      const { error: modeError } = await supabase
        .from("bowls")
        .update({ draw_access_mode: nextMode })
        .eq("id", bowlId);

      if (modeError) {
        if (isMissingDrawAccessColumn(modeError)) {
          setErrorMessage("Draw access requires the latest database migration. Please run it and try again.");
          return;
        }
        console.error("[BowlSettings] Failed to save draw access mode", modeError);
        setErrorMessage("Failed to update draw access mode.");
        return;
      }

      const { error: clearError } = await supabase
        .from("bowl_draw_permissions")
        .delete()
        .eq("bowl_id", bowlId);

      if (clearError) {
        if (isMissingDrawPermissionsTable(clearError)) {
          setErrorMessage("Draw access requires the latest database migration. Please run it and try again.");
          return;
        }
        console.error("[BowlSettings] Failed to reset draw permissions", clearError);
        setErrorMessage("Failed to update draw permissions.");
        return;
      }

      if (nextMode === DRAW_ACCESS_MODE_SELECTED && nextAllowedUserIds.length > 0) {
        const permissionRows = nextAllowedUserIds.map((userId) => ({
          bowl_id: bowlId,
          user_id: userId,
        }));

        const { error: insertError } = await supabase
          .from("bowl_draw_permissions")
          .insert(permissionRows);

        if (insertError) {
          if (isMissingDrawPermissionsTable(insertError)) {
            setErrorMessage("Draw access requires the latest database migration. Please run it and try again.");
            return;
          }
          console.error("[BowlSettings] Failed to save draw permissions", insertError);
          setErrorMessage("Failed to save allowed members for drawing.");
          return;
        }
      }

      setActionMessage("Draw access updated.");
      await loadBowlAndMembers();
    } catch (err) {
      console.error("[BowlSettings] Unexpected error saving draw access", err);
      setErrorMessage("Unexpected error updating draw access.");
    } finally {
      setIsSavingDrawAccess(false);
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
    <div className="page-container py-5">
      <header className="mb-5 flex items-center justify-between">
        <button onClick={() => navigate(`/bowl/${bowlId}`)} className="btn btn-ghost px-3 py-2">
          Back
        </button>
        <h2 className="max-w-[70%] truncate text-2xl font-semibold text-slate-100">{bowlName}</h2>
        <div />
      </header>

      {isLoading && <div className="text-sm text-gray-600">Loading…</div>}
      {!isLoading && errorMessage && <div className="mb-2 text-sm text-red-400">{errorMessage}</div>}
      {!isLoading && actionMessage && <div className="mb-2 text-sm text-emerald-300">{actionMessage}</div>}

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
        <section className="panel mb-4">
          <h3 className="section-title mb-2">Draw Access</h3>
          <p className="text-sm text-slate-600 mb-3">
            Set who can draw movies from this bowl. Owner is always allowed.
          </p>
          <form onSubmit={handleSaveDrawAccess} className="space-y-3">
            <div className="flex flex-wrap gap-4">
              <label htmlFor="draw-access-all-members" className="inline-flex items-center gap-2 text-sm text-slate-800">
                <input
                  id="draw-access-all-members"
                  name="draw_access_mode"
                  type="radio"
                  value={DRAW_ACCESS_MODE_ALL}
                  checked={drawAccessMode === DRAW_ACCESS_MODE_ALL}
                  onChange={(e) => setDrawAccessMode(e.target.value)}
                />
                Everyone in bowl
              </label>
              <label htmlFor="draw-access-selected-members" className="inline-flex items-center gap-2 text-sm text-slate-800">
                <input
                  id="draw-access-selected-members"
                  name="draw_access_mode"
                  type="radio"
                  value={DRAW_ACCESS_MODE_SELECTED}
                  checked={drawAccessMode === DRAW_ACCESS_MODE_SELECTED}
                  onChange={(e) => setDrawAccessMode(e.target.value)}
                />
                Only selected members
              </label>
            </div>

            {drawAccessMode === DRAW_ACCESS_MODE_SELECTED && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-600 mb-2">
                  Only selected members can draw. Owner can always draw.
                </p>
                <div className="space-y-2">
                  {members
                    .filter((member) => member?.user_id === ownerId)
                    .map((member) => {
                      const email = member.profiles?.email || member.user_id;
                      return (
                        <div key={member.user_id} className="text-sm text-slate-700">
                          {email} <span className="text-xs text-slate-500">(Always allowed)</span>
                        </div>
                      );
                    })}
                  {members
                    .filter((member) => member?.user_id && member.user_id !== ownerId)
                    .map((member) => {
                      const email = member.profiles?.email || member.user_id;
                      const checkboxId = `draw-access-member-${member.user_id}`;
                      return (
                        <label key={member.user_id} htmlFor={checkboxId} className="inline-flex w-full items-center gap-2 text-sm text-slate-800">
                          <input
                            id={checkboxId}
                            name="draw_access_allowed_members"
                            type="checkbox"
                            checked={drawAllowedUserIds.includes(member.user_id)}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setDrawAllowedUserIds((prev) => {
                                if (checked) return prev.includes(member.user_id) ? prev : [...prev, member.user_id];
                                return prev.filter((id) => id !== member.user_id);
                              });
                            }}
                          />
                          {email}
                        </label>
                      );
                    })}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingDrawAccess}
              className="btn btn-secondary disabled:opacity-60"
            >
              {isSavingDrawAccess ? "Saving..." : "Save Draw Access"}
            </button>
          </form>
        </section>
      )}

      {!isOwner && currentUserId && (
        <section className="panel mb-4 border-amber-900/60">
          <h3 className="section-title mb-2 text-amber-700">Leave Bowl</h3>
          <p className="text-sm text-slate-600 mb-3">
            You will be removed from this bowl and can rejoin only by invite.
          </p>
          <button
            type="button"
            onClick={handleLeaveBowl}
            className="btn border border-amber-800 bg-amber-950/40 text-amber-300 hover:bg-amber-900/40 focus-visible:ring-amber-900/40"
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

      {currentUserId && (
        <section className="panel mt-4">
          <h3 className="section-title mb-3">Add Links</h3>
          <p className="mb-3 text-sm text-slate-300">
            Generate a public link that lets anyone add a fixed number of movies without joining the bowl.
          </p>

          <form onSubmit={handleCreateAddLink} className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div>
              <label htmlFor="add-link-max-adds" className="mb-1 block text-sm text-slate-300">
                Allowed adds
              </label>
              <input
                id="add-link-max-adds"
                name="add_link_max_adds"
                type="number"
                min="1"
                step="1"
                value={newAddLinkMaxAdds}
                onChange={(e) => setNewAddLinkMaxAdds(e.target.value)}
                className="input-field w-36"
              />
            </div>
            <div className="sm:flex-1">
              <label htmlFor="add-link-default-contributor-name" className="mb-1 block text-sm text-slate-300">
                Default contributor label
              </label>
              <input
                id="add-link-default-contributor-name"
                name="add_link_default_contributor_name"
                type="text"
                value={newAddLinkDefaultContributorName}
                onChange={(e) => setNewAddLinkDefaultContributorName(e.target.value)}
                placeholder="Dad"
                className="input-field"
              />
            </div>
            <button type="submit" className="btn btn-secondary">
              Create Add Link
            </button>
          </form>

          {generatedAddLink && (
            <div className="mb-4 rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <div className="mb-1 text-xs text-slate-400">New add link</div>
              <div className="flex items-center gap-2">
                <input readOnly value={generatedAddLink} className="input-field flex-1 text-xs" />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(generatedAddLink);
                      setActionMessage("Add link copied.");
                    } catch (err) {
                      console.error("[BowlSettings] Failed to copy add link", err);
                    }
                  }}
                  className="btn btn-secondary text-sm px-3 py-2"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {addLinks.length === 0 ? (
            <div className="text-sm text-slate-400">No add links yet.</div>
          ) : (
            <div className="space-y-2">
              {addLinks.map((link) => {
                const remainingAdds = Math.max(0, Number(link.max_adds || 0) - Number(link.adds_used || 0));
                const isRevoked = Boolean(link.revoked_at);
                const linkUrl = buildAddLinkUrl(link.token);
                return (
                  <div
                    key={link.id}
                    className="rounded-lg border border-slate-700 bg-slate-950/50 p-3"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-100">
                          {remainingAdds} of {link.max_adds} adds remaining
                        </div>
                        <div className="text-xs text-slate-400">
                          {isRevoked ? "Revoked" : remainingAdds === 0 ? "Exhausted" : "Active"}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          Default label: {link.default_contributor_name || "Link Guest"}
                        </div>
                        <div className="mt-2 truncate text-xs text-slate-500">{linkUrl}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(linkUrl);
                              setActionMessage("Add link copied.");
                            } catch (err) {
                              console.error("[BowlSettings] Failed to copy add link", err);
                            }
                          }}
                          className="btn btn-secondary text-sm px-3 py-2"
                        >
                          Copy
                        </button>
                        {!isRevoked && (
                          <button
                            type="button"
                            onClick={() => {
                              void handleRevokeAddLink(link.id);
                            }}
                            className="btn border border-red-900/70 bg-red-950/40 px-3 py-2 text-sm text-red-300 hover:bg-red-900/40 focus-visible:ring-red-900/40"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="sm:flex-1">
                        <label htmlFor={`add-link-label-${link.id}`} className="mb-1 block text-xs text-slate-400">
                          Contributor label
                        </label>
                        <input
                          id={`add-link-label-${link.id}`}
                          type="text"
                          value={editingAddLinkNames[link.id] ?? ""}
                          onChange={(event) =>
                            setEditingAddLinkNames((prev) => ({
                              ...prev,
                              [link.id]: event.target.value,
                            }))
                          }
                          placeholder="Dad"
                          className="input-field text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void handleSaveAddLinkName(link.id);
                        }}
                        className="btn btn-secondary text-sm px-3 py-2"
                      >
                        Save Label
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {isOwner && (
        <section className="panel-muted mt-5 border border-red-900/60">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-red-400">Danger zone</h3>
          <h4 className="section-title mb-2 text-base">Delete Bowl</h4>
          <p className="mb-3 text-sm text-slate-400">
            Permanently deletes this bowl, including movies, members, and pending invites.
          </p>
          <form onSubmit={handleDeleteBowl} className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
              className="btn btn-danger disabled:opacity-60"
            >
              {isDeletingBowl ? "Deleting..." : "Delete Bowl"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
