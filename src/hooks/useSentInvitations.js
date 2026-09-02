import { useCallback, useEffect, useRef, useState } from "react";
import { createBowlInvitations, revokeBowlInvitation } from "../lib/bowlInvites";
import { sendInviteEmails } from "../lib/inviteEmails";
import { supabase } from "../lib/supabase";

const LOAD_ERROR = "Could not load the invitations you sent. Try again.";

// Owner-side invitation state for the Invitations hub. The database owns
// normalization, uniqueness, tokens and the accept-vs-revoke race (see
// create_bowl_invites / revoke_bowl_invite); this hook reconciles those outcomes
// with the list on screen and with email delivery.
export default function useSentInvitations(ownedBowls) {
  const [invitations, setInvitations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  // Held across retries so a resend after a timeout replays the same batch
  // instead of creating a second live invitation.
  const requestId = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);

  const ownedBowlIds = ownedBowls.map((bowl) => bowl.id).join(",");

  const load = useCallback(async () => {
    const bowlIds = ownedBowlIds ? ownedBowlIds.split(",") : [];
    const request = ++generation.current;
    setIsLoading(true);
    if (bowlIds.length === 0) {
      setInvitations([]);
      setLoadError(null);
      setIsLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("bowl_invites")
      .select("id, bowl_id, invited_email, token, created_at")
      .is("accepted_at", null)
      .in("bowl_id", bowlIds)
      .order("created_at", { ascending: false });
    if (!mounted.current || request !== generation.current) return;
    if (error) {
      console.error("[useSentInvitations] Failed to load sent invitations", error);
      // Keep whatever was already on screen: a failed read is not evidence that
      // the invitations are gone.
      setLoadError(LOAD_ERROR);
      setIsLoading(false);
      return;
    }
    setInvitations(data || []);
    setLoadError(null);
    setIsLoading(false);
  }, [ownedBowlIds]);

  useEffect(() => { void load(); }, [load]);

  const send = useCallback(async ({ bowlId, bowlName, emails, senderEmail }) => {
    if (!requestId.current) requestId.current = crypto.randomUUID();
    setIsSending(true);
    try {
      const { data, error } = await createBowlInvitations({
        bowlId,
        emails,
        requestId: requestId.current,
      });
      if (error || !Array.isArray(data?.invitations)) {
        console.error("[useSentInvitations] Failed to create invitations", error);
        return { ok: false, message: "Invitations could not be created. Try again." };
      }

      // The batch is authoritative; email delivery is a follow-up that can fail
      // on its own without unmaking any of these rows.
      requestId.current = null;
      const outcomes = data.invitations;
      const created = outcomes.filter((row) => row.status === "created" && row.token);
      const alreadyMember = outcomes.filter((row) => row.status === "already_member");
      const alreadyPending = outcomes.filter((row) => row.status === "already_pending");
      await load();

      if (created.length === 0) {
        const parts = [];
        if (alreadyPending.length > 0) parts.push(`${alreadyPending.length} already had an invitation pending`);
        if (alreadyMember.length > 0) parts.push(`${alreadyMember.length} already a member`);
        return {
          ok: true,
          message: parts.length > 0
            ? `No new invitations were needed — ${parts.join(", ")}.`
            : "No new invitations were needed.",
        };
      }

      const emailResult = await sendInviteEmails(created.map((row) => ({
        bowlId,
        bowlName,
        invitedEmail: row.invited_email,
        invitedByEmail: senderEmail || null,
        token: row.token,
      })));

      const count = created.length;
      const plural = count === 1 ? "" : "s";
      if (!emailResult.error && emailResult.failed === 0) {
        return { ok: true, message: `Sent ${count} invitation${plural} to ${bowlName}.` };
      }
      return {
        ok: true,
        message: `${count} invitation${plural} created, but ${emailResult.failed || count} email${(emailResult.failed || count) === 1 ? "" : "s"} could not be sent. Copy and share their invitation links below.`,
      };
    } finally {
      if (mounted.current) setIsSending(false);
    }
  }, [load]);

  const revoke = useCallback(async ({ bowlId, invitationId, invitedEmail }) => {
    const { data: outcome, error } = await revokeBowlInvitation({ bowlId, invitationId });
    if (error) {
      console.error("[useSentInvitations] Failed to revoke invitation", error);
      return { ok: false, message: "Could not revoke that invitation. Try again." };
    }
    await load();
    if (outcome === "revoked") return { ok: true, message: `Invitation revoked for ${invitedEmail}.` };
    if (outcome === "already_accepted") {
      return { ok: true, message: `${invitedEmail} accepted before the invitation could be revoked.` };
    }
    if (outcome === "not_pending") {
      return { ok: true, message: `The invitation for ${invitedEmail} is no longer pending.` };
    }
    console.error("[useSentInvitations] Unexpected revoke outcome", outcome);
    return { ok: false, message: "Could not revoke that invitation. Try again." };
  }, [load]);

  return { invitations, isLoading, loadError, isSending, refresh: load, send, revoke };
}
