import { notifyBowlChange } from "./bowlChanges";
import { createBowlInvitations } from "./bowlInvites";
import { sendInviteEmails } from "./inviteEmails";
import { supabase } from "./supabase";
import { MAX_BOWLS_PER_USER } from "../utils/appLimits";
import { parseInviteEmails } from "../utils/parseInviteEmails";

export const UNKNOWN_CREATE_MESSAGE =
  "Could not finish creating the bowl. Check your bowls before trying again.";

export const createBowlResult = ({
  ok,
  code = null,
  errorMessage = null,
  actionMessage = null,
  bowl = null,
}) => ({ ok, code, errorMessage, actionMessage, bowl });

export function createBowlCreationService({
  client = supabase,
  parseEmails = parseInviteEmails,
  publish = notifyBowlChange,
  sendEmails = sendInviteEmails,
  requestIdFactory = () => crypto.randomUUID(),
  bowlIdFactory = () => crypto.randomUUID(),
  maxOwnedBowls = MAX_BOWLS_PER_USER,
} = {}) {
  async function create({ bowlName: rawBowlName, inviteEmails = "", ownedBowlCount = 0, bowlId = null }) {
    if (ownedBowlCount >= maxOwnedBowls) {
      return createBowlResult({
        ok: false,
        code: "limit_reached",
        errorMessage: `You can create up to ${maxOwnedBowls} bowls.`,
      });
    }

    const bowlName = String(rawBowlName || "").trim();
    if (!bowlName) {
      return createBowlResult({
        ok: false,
        code: "name_required",
        errorMessage: "Bowl name is required.",
      });
    }

    const { validEmails, invalidEmails } = parseEmails(inviteEmails);
    if (invalidEmails.length > 0) {
      return createBowlResult({
        ok: false,
        code: "invalid_invites",
        errorMessage: `Invalid email(s): ${invalidEmails.join(", ")}`,
      });
    }

    const { data: authData, error: userError } = await client.auth.getSession();
    const user = authData?.session?.user;
    if (userError || !user) {
      console.error("Not authenticated", userError);
      return createBowlResult({
        ok: false,
        code: "not_authenticated",
        errorMessage: "You must be signed in to create a bowl.",
      });
    }

    // The bowl id is the creation's identity: the caller keeps it across
    // retries, so a repeat after a lost response returns the bowl the first
    // attempt made instead of making another.
    const { data: bowlData, error: bowlError } = await client.rpc("create_owned_bowl", {
      p_bowl_id: bowlId || bowlIdFactory(),
      p_name: bowlName,
    });
    // A composite return can arrive as a one-row array.
    const newBowl = Array.isArray(bowlData) ? bowlData[0] : bowlData;

    if (bowlError || !newBowl?.id) {
      console.error("Failed to create bowl", bowlError);
      if (bowlError?.hint === "limit_reached") {
        return createBowlResult({
          ok: false,
          code: "limit_reached",
          errorMessage: `You can create up to ${maxOwnedBowls} bowls.`,
        });
      }
      // A database error means the transaction rolled back. No error code
      // means the request never got an answer, so the bowl may exist.
      return createBowlResult({
        ok: false,
        code: bowlError?.code ? "create_failed" : "outcome_unknown",
        errorMessage: bowlError?.code ? "Failed to create bowl." : UNKNOWN_CREATE_MESSAGE,
      });
    }

    publish({ userId: user.id, bowlId: newBowl.id });

    // A retry can land on a bowl an earlier attempt already made under the
    // name typed then; say so rather than let the name silently differ.
    const earlierAttemptNote = newBowl.name !== bowlName
      ? `Your earlier attempt had already created “${newBowl.name}”.`
      : null;

    if (validEmails.length === 0) {
      return createBowlResult({ ok: true, actionMessage: earlierAttemptNote, bowl: newBowl });
    }

    const { data: inviteData, error: inviteError } = await createBowlInvitations(
      {
        bowlId: newBowl.id,
        emails: validEmails,
        requestId: requestIdFactory(),
      },
      client
    );

    if (inviteError || !Array.isArray(inviteData?.invitations)) {
      console.error("Failed to create invites", inviteError);
      // The bowl and its owner membership are ready even though the optional
      // invitation work failed, so callers should still refresh and close.
      return createBowlResult({
        ok: true,
        code: "invites_failed",
        errorMessage: "Bowl created, but invites could not be created.",
        bowl: newBowl,
      });
    }

    const invitationsToEmail = (inviteData?.invitations || [])
      .filter((invitation) => invitation?.status === "created" && invitation?.token)
      .map((invitation) => ({
        bowlId: newBowl.id,
        bowlName: newBowl.name,
        invitedEmail: invitation.invited_email,
        invitedByEmail: user.email || null,
        token: invitation.token,
      }));

    if (invitationsToEmail.length === 0) {
      return createBowlResult({
        ok: true,
        actionMessage: "Bowl created. No new invitations were needed.",
        bowl: newBowl,
      });
    }

    const emailResult = await sendEmails(invitationsToEmail);

    let actionMessage;
    if (!emailResult.error && emailResult.failed === 0) {
      actionMessage = `Bowl created and ${emailResult.sent} invite email${emailResult.sent === 1 ? "" : "s"} sent.`;
    } else if (emailResult.sent > 0) {
      actionMessage = `Bowl created, but only ${emailResult.sent} of ${invitationsToEmail.length} invite email${invitationsToEmail.length === 1 ? "" : "s"} sent.`;
    } else {
      actionMessage = "Bowl created, but invite emails could not be sent. You can still share the invite links from Bowl Settings.";
    }

    return createBowlResult({ ok: true, actionMessage, bowl: newBowl });
  }

  return { create };
}

export const bowlCreationService = createBowlCreationService();
