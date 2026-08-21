import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AutosaveStatus from "../components/AutosaveStatus";
import useAutosave, { valuesAreEqual } from "../hooks/useAutosave";
import { sendInviteEmails } from "../lib/inviteEmails";
import { supabase } from "../lib/supabase";
import { parseInviteEmails } from "../utils/parseInviteEmails";
import { forgetLastOpenedBowl, getLastOpenedBowlId } from "../utils/lastOpenedBowl";
import {
  DEFAULT_DRAW_METHOD,
  DRAW_METHOD_OPTIONS,
  getDrawMethod,
  normalizeDrawMethod,
} from "../utils/drawMethods";

const DRAW_ACCESS_MODE_ALL = "all_members";
const DRAW_ACCESS_MODE_SELECTED = "selected_members";

// Bowl-level settings screen.
// MVP scope: manage members + invites for a bowl.
// - Owner can create invite links by email.
// - Owner can remove non-owner members.
// - Members can view the membership list.
export default function BowlSettings() {
  const { bowlId } = useParams();
  const navigate = useNavigate();

  // Leaving or deleting the bowl must also drop it as the remembered landing
  // spot, otherwise "/" would send the user straight back into it.
  const leaveBowlList = (userId) => {
    if (userId && getLastOpenedBowlId(userId) === bowlId) {
      forgetLastOpenedBowl(userId);
    }
    navigate("/bowls", { replace: true });
  };

  const [bowlName, setBowlName] = useState("Bowl Settings");
  const [drawAccessMode, setDrawAccessMode] = useState(DRAW_ACCESS_MODE_ALL);
  const [drawAllowedUserIds, setDrawAllowedUserIds] = useState([]);
  const [drawMethod, setDrawMethod] = useState(DEFAULT_DRAW_METHOD);
  const [editableBowlName, setEditableBowlName] = useState("Bowl Settings");
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
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeletingBowl, setIsDeletingBowl] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState("");

  const isOwner = useMemo(() => {
    return Boolean(ownerId && currentUserId && ownerId === currentUserId);
  }, [ownerId, currentUserId]);

  const validDrawAllowedUserIds = useMemo(() => {
    const memberIds = new Set(
      members
        .map((member) => member?.user_id)
        .filter((id) => Boolean(id && id !== ownerId))
    );
    return [...new Set(drawAllowedUserIds)]
      .filter((id) => memberIds.has(id))
      .sort();
  }, [drawAllowedUserIds, members, ownerId]);

  const bowlSettingsSnapshot = useMemo(
    () => ({
      name: editableBowlName,
      drawMethod: normalizeDrawMethod(drawMethod),
      drawAccessMode:
        drawAccessMode === DRAW_ACCESS_MODE_SELECTED
          ? DRAW_ACCESS_MODE_SELECTED
          : DRAW_ACCESS_MODE_ALL,
      drawAllowedUserIds:
        drawAccessMode === DRAW_ACCESS_MODE_SELECTED ? validDrawAllowedUserIds : [],
      addLinkNames: editingAddLinkNames,
    }),
    [
      drawAccessMode,
      drawMethod,
      editableBowlName,
      editingAddLinkNames,
      validDrawAllowedUserIds,
    ]
  );

  const persistBowlSettings = useCallback(
    async (next, previous) => {
      const bowlPreferencesChanged =
        !valuesAreEqual(next.name, previous.name) ||
        !valuesAreEqual(next.drawMethod, previous.drawMethod) ||
        !valuesAreEqual(next.drawAccessMode, previous.drawAccessMode) ||
        !valuesAreEqual(next.drawAllowedUserIds, previous.drawAllowedUserIds);
      if (bowlPreferencesChanged && !isOwner) {
        return { error: new Error("Only the bowl owner can update bowl settings.") };
      }

      const isMissingRpcMigration = (error, rpcName) => {
        const errorText = String(error?.message || "").toLowerCase();
        return (
          error?.code === "PGRST202" ||
          (errorText.includes(rpcName) &&
            (errorText.includes("could not find") || errorText.includes("does not exist")))
        );
      };

      try {
        if (!valuesAreEqual(next.name, previous.name)) {
          const nextName = next.name.trim();
          if (!nextName) {
            return { error: new Error("Bowl name cannot be empty.") };
          }

          const { error } = await supabase
            .from("bowls")
            .update({ name: nextName })
            .eq("id", bowlId);

          if (error) {
            console.error("[BowlSettings] Failed to rename bowl", error);
            return { error: new Error("Failed to update bowl name.") };
          }
          setBowlName(nextName);
        }

        if (!valuesAreEqual(next.drawMethod, previous.drawMethod)) {
          const { error } = await supabase.rpc("save_bowl_draw_method", {
            p_bowl_id: bowlId,
            p_method: next.drawMethod,
          });

          if (error) {
            if (isMissingRpcMigration(error, "save_bowl_draw_method")) {
              return {
                error: new Error(
                  "The draw method requires the latest database migration. Please run it and try again."
                ),
              };
            }
            console.error("[BowlSettings] Failed to save draw method", error);
            return { error: new Error("Failed to update the draw method.") };
          }
        }

        const drawAccessChanged =
          !valuesAreEqual(next.drawAccessMode, previous.drawAccessMode) ||
          !valuesAreEqual(next.drawAllowedUserIds, previous.drawAllowedUserIds);
        if (drawAccessChanged) {
          const { error } = await supabase.rpc("save_bowl_draw_access", {
            p_bowl_id: bowlId,
            p_mode: next.drawAccessMode,
            p_allowed_user_ids:
              next.drawAccessMode === DRAW_ACCESS_MODE_SELECTED
                ? next.drawAllowedUserIds
                : [],
          });

          if (error) {
            if (isMissingRpcMigration(error, "save_bowl_draw_access")) {
              return {
                error: new Error(
                  "Draw access requires the latest database migration. Please run it and try again."
                ),
              };
            }
            console.error("[BowlSettings] Failed to save draw access", error);
            return { error: new Error("Failed to update draw access.") };
          }
        }

        const changedAddLinkIds = Object.keys(next.addLinkNames).filter(
          (linkId) =>
            Object.prototype.hasOwnProperty.call(previous.addLinkNames, linkId) &&
            !valuesAreEqual(next.addLinkNames[linkId], previous.addLinkNames[linkId])
        );
        for (const linkId of changedAddLinkIds) {
          const nextName = String(next.addLinkNames[linkId] || "").trim();
          const { error } = await supabase
            .from("bowl_add_links")
            .update({ default_contributor_name: nextName || null })
            .eq("id", linkId);

          if (error) {
            console.error("[BowlSettings] Failed to save add link label", error);
            return { error: new Error("Failed to save add link label.") };
          }
          setAddLinks((current) =>
            current.map((link) =>
              link.id === linkId
                ? { ...link, default_contributor_name: nextName || null }
                : link
            )
          );
        }

        return { error: null };
      } catch (error) {
        console.error("[BowlSettings] Unexpected error saving bowl settings", error);
        return { error: new Error("Unexpected error saving bowl settings.") };
      }
    },
    [bowlId, isOwner]
  );

  const { status: saveStatus, error: saveError, retry: retrySave } = useAutosave({
    value: bowlSettingsSnapshot,
    save: persistBowlSettings,
    enabled: !isLoading && Boolean(currentUserId),
  });

  const loadBowlAndMembers = async () => {
    if (!bowlId) return;

    setIsLoading(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const isMissingDrawAccessColumn = (error) =>
        String(error?.message || "").toLowerCase().includes("draw_access_mode");
      const isMissingDrawMethodColumn = (error) =>
        String(error?.message || "").toLowerCase().includes("draw_method");
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
      // Each optional column is dropped on its own so a deploy that lands
      // ahead of the migration degrades one feature instead of all of them.
      let { data: bowl, error: bowlError } = await supabase
        .from("bowls")
        .select("id, name, owner_id, draw_access_mode, draw_method")
        .eq("id", bowlId)
        .single();

      if (bowlError && isMissingDrawMethodColumn(bowlError)) {
        const fallback = await supabase
          .from("bowls")
          .select("id, name, owner_id, draw_access_mode")
          .eq("id", bowlId)
          .single();
        bowl = fallback.data;
        bowlError = fallback.error;
      }

      if (bowlError && isMissingDrawAccessColumn(bowlError)) {
        const fallback = await supabase
          .from("bowls")
          .select("id, name, owner_id")
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
      setEditableBowlName(bowl?.name || "Bowl Settings");
      setDrawAccessMode(
        bowl?.draw_access_mode === DRAW_ACCESS_MODE_SELECTED
          ? DRAW_ACCESS_MODE_SELECTED
          : DRAW_ACCESS_MODE_ALL
      );
      setDrawMethod(normalizeDrawMethod(bowl?.draw_method));
      setOwnerId(bowl?.owner_id ?? null);

      // Load membership rows separately from the bowl-scoped email directory.
      const { data: memberRows, error: membersError } = await supabase
        .from("bowl_members")
        .select("user_id, role")
        .eq("bowl_id", bowlId)
        .order("role", { ascending: false });

      if (membersError) {
        console.error("[BowlSettings] Failed to load members", membersError);
        setErrorMessage("Failed to load bowl members.");
        setMembers([]);
        setIsLoading(false);
        return;
      }

      const { data: profileRows, error: profilesError } = await supabase.rpc(
        "get_bowl_profile_directory",
        { p_bowl_id: bowlId }
      );

      if (profilesError) {
        console.error("[BowlSettings] Failed to load member profiles", profilesError);
      }

      const emailByUserId = new Map(
        (profileRows || []).map((profile) => [profile.user_id, profile.email])
      );
      setMembers(
        (memberRows || []).map((member) => {
          const email = emailByUserId.get(member.user_id);
          return {
            ...member,
            profiles: email ? { email } : null,
          };
        })
      );

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

  const handleDeleteAddLink = async (linkId) => {
    setActionMessage(null);
    setErrorMessage(null);

    try {
      const { error } = await supabase
        .from("bowl_add_links")
        .delete()
        .eq("id", linkId);

      if (error) {
        console.error("[BowlSettings] Failed to delete add link", error);
        setErrorMessage("Failed to delete add link.");
        return;
      }

      await loadBowlAndMembers();
      setActionMessage("Add link deleted.");
    } catch (err) {
      console.error("[BowlSettings] Unexpected error deleting add link", err);
      setErrorMessage("Unexpected error deleting add link.");
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

  // The button is disabled until this matches, but the check stays here too:
  // it is the guard that actually protects the bowl.
  const isDeleteConfirmed = deleteConfirmText.trim() === "DELETE";

  const handleDeleteBowl = async (e) => {
    e.preventDefault();
    setActionMessage(null);
    setErrorMessage(null);

    if (!isOwner) {
      setErrorMessage("Only the bowl owner can delete this bowl.");
      return;
    }

    if (!isDeleteConfirmed) {
      setErrorMessage('Type "DELETE" to confirm bowl deletion.');
      return;
    }

    setIsDeletingBowl(true);

    try {
      const { error: deleteError } = await supabase.rpc("delete_owned_bowl", {
        p_bowl_id: bowlId,
      });

      if (deleteError) {
        console.error("[BowlSettings] Failed to delete bowl", deleteError);
        setErrorMessage("Failed to delete bowl.");
        return;
      }

      leaveBowlList(currentUserId);
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

      leaveBowlList(currentUserId);
    } catch (err) {
      console.error("[BowlSettings] Unexpected error leaving bowl", err);
      setErrorMessage("Unexpected error leaving bowl.");
    }
  };

  return (
    <div className="page-container py-6 sm:py-8">
      <header className="page-hero mb-6 flex items-center justify-between gap-3">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button onClick={() => navigate(`/bowl/${bowlId}`)} className="btn btn-ghost px-3 py-2">
            <span aria-hidden="true">←</span> Back
          </button>
          {!isLoading && currentUserId && <AutosaveStatus status={saveStatus} />}
        </div>
        <div className="min-w-0 text-right">
          <p className="eyebrow">Bowl settings</p>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">{bowlName}</h1>
        </div>
      </header>

      {isLoading && <div className="panel text-sm text-slate-400" role="status">Loading…</div>}
      {!isLoading && currentUserId && saveStatus === "error" && (
        <div
          role="alert"
          className="sticky bottom-4 z-20 mx-auto mb-4 flex max-w-5xl flex-col gap-3 rounded-xl border border-rose-500/60 bg-rose-950/90 px-4 py-3 text-sm text-rose-100 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-semibold">Your changes haven&apos;t been saved.</p>
            <p className="mt-0.5 text-rose-200/90">
              {saveError?.message || "Something went wrong while saving. Check your connection and try again."}
            </p>
          </div>
          <button type="button" onClick={retrySave} className="btn btn-primary shrink-0">
            Retry
          </button>
        </div>
      )}
      {!isLoading && errorMessage && <div className="status-error mb-4">{errorMessage}</div>}
      {!isLoading && actionMessage && <div className="status-success mb-4">{actionMessage}</div>}

      {isOwner && (
        <section className="panel mb-4">
          <h3 className="section-title mb-3">Bowl Name</h3>
          <div className="space-y-3">
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
          </div>
        </section>
      )}

      {/* Gated on load: naming the wrong method, even for a frame, is exactly
          the falsehood this setting exists to prevent. */}
      {!isLoading && (isOwner ? (
        <section className="panel mb-4">
          <h3 className="section-title mb-2">Draw Method</h3>
          <p className="text-sm text-slate-400 mb-3">
            Set how this bowl picks a movie. Every draw from this bowl uses it, no matter who taps
            Draw.
          </p>
          <div className="space-y-3">
            <div className="space-y-2">
              {DRAW_METHOD_OPTIONS.map((method) => {
                const inputId = `draw-method-${method.id}`;
                return (
                  <label
                    key={method.id}
                    htmlFor={inputId}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-700 bg-slate-800/60 p-3"
                  >
                    <input
                      id={inputId}
                      name="draw_method"
                      type="radio"
                      className="mt-1"
                      value={method.id}
                      checked={drawMethod === method.id}
                      onChange={(e) => setDrawMethod(e.target.value)}
                    />
                    <span>
                      <span className="block text-sm text-slate-100">{method.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-400">{method.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </section>
      ) : (
        <section className="panel mb-4">
          <h3 className="section-title mb-2">Draw Method</h3>
          <p className="text-sm text-slate-100">{getDrawMethod(drawMethod).label}</p>
          <p className="mt-1 text-sm text-slate-400">{getDrawMethod(drawMethod).description}</p>
          <p className="mt-2 text-xs text-slate-500">Only the bowl owner can change this.</p>
        </section>
      ))}

      {isOwner && (
        <section className="panel mb-4">
          <h3 className="section-title mb-2">Draw Access</h3>
          <p className="text-sm text-slate-400 mb-3">
            Set who can draw movies from this bowl. Owner is always allowed.
          </p>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4">
              <label htmlFor="draw-access-all-members" className="inline-flex items-center gap-2 text-sm text-slate-100">
                <input
                  id="draw-access-all-members"
                  name="draw_access_mode"
                  type="radio"
                  value={DRAW_ACCESS_MODE_ALL}
                  checked={drawAccessMode === DRAW_ACCESS_MODE_ALL}
                  onChange={(e) => {
                    setDrawAccessMode(e.target.value);
                    setDrawAllowedUserIds([]);
                  }}
                />
                Everyone in bowl
              </label>
              <label htmlFor="draw-access-selected-members" className="inline-flex items-center gap-2 text-sm text-slate-100">
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
              <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                <p className="text-xs text-slate-400 mb-2">
                  Only selected members can draw. Owner can always draw.
                </p>
                <div className="space-y-2">
                  {members
                    .filter((member) => member?.user_id === ownerId)
                    .map((member) => {
                      const email = member.profiles?.email || member.user_id;
                      return (
                        <div key={member.user_id} className="text-sm text-slate-300">
                          {email} <span className="text-xs text-slate-400">(Always allowed)</span>
                        </div>
                      );
                    })}
                  {members
                    .filter((member) => member?.user_id && member.user_id !== ownerId)
                    .map((member) => {
                      const email = member.profiles?.email || member.user_id;
                      const checkboxId = `draw-access-member-${member.user_id}`;
                      return (
                        <label key={member.user_id} htmlFor={checkboxId} className="inline-flex w-full items-center gap-2 text-sm text-slate-100">
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
          </div>
        </section>
      )}

      {!isOwner && currentUserId && (
        <section className="panel mb-4 border-amber-900/60">
          <h3 className="section-title mb-2 text-amber-300">Leave Bowl</h3>
          <p className="text-sm text-slate-400 mb-3">
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
          <p className="text-sm text-slate-400 mb-3">
            Only the bowl owner can invite or remove members.
          </p>
        )}

        {isOwner && (
          <form onSubmit={handleCreateInvite} className="mb-4 flex flex-col gap-2 sm:flex-row">
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
          <div className="mb-4 rounded-lg border border-slate-700 p-3 bg-slate-800/60">
            <div className="text-xs text-slate-400 mb-1">Invite link</div>
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
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950/35 p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{inv.invited_email}</div>
                      <div className="text-xs text-slate-400">Not accepted yet</div>
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
                      className="btn btn-danger px-3 py-2 text-sm"
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
            <div className="text-sm text-slate-400">No members found.</div>
          ) : (
            members.map((m) => {
              const email = m.profiles?.email || m.user_id;
              const isOwnerRole = m.role === "Owner";

              return (
                <div
                  key={m.user_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950/35 p-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{email}</div>
                    <div className="text-xs text-slate-400">{m.role}</div>
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
                const linkUrl = buildAddLinkUrl(link.token);
                return (
                  <div
                    key={link.id}
                    className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 transition hover:border-slate-600"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-100">
                          {remainingAdds} of {link.max_adds} adds remaining
                        </div>
                        <div className="text-xs text-slate-400">
                          {link.revoked_at ? "Revoked" : remainingAdds === 0 ? "Exhausted" : "Active"}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          Default label: {link.default_contributor_name || "Link Guest"}
                        </div>
                        <div className="mt-2 truncate text-xs text-slate-400">{linkUrl}</div>
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
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeleteAddLink(link.id);
                          }}
                          className="btn btn-danger px-3 py-2 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div>
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
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {isOwner && (
        <section className="panel-muted mt-5 border border-rose-900/60 bg-rose-950/10">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-rose-400">Danger zone</h3>
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
              disabled={isDeletingBowl || !isDeleteConfirmed}
              className="btn btn-danger disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isDeletingBowl ? "Deleting..." : "Delete Bowl"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
