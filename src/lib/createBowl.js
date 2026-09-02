import { notifyBowlChange } from "./bowlChanges";
import { sendInviteEmails } from "./inviteEmails";
import { supabase } from "./supabase";
import { MAX_BOWLS_PER_USER } from "../utils/appLimits";
import { parseInviteEmails } from "../utils/parseInviteEmails";

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
  tokenFactory = () => crypto.randomUUID(),
  maxOwnedBowls = MAX_BOWLS_PER_USER,
} = {}) {
  async function create({ bowlName: rawBowlName, inviteEmails = "", ownedBowlCount = 0 }) {
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

    const insertBowl = (payload) => client
      .from("bowls")
      .insert([payload])
      .select()
      .single();

    let { data: newBowl, error: bowlError } = await insertBowl({
      owner_id: user.id,
      name: bowlName,
      draw_access_mode: "all_members",
    });

    if (bowlError && String(bowlError?.message || "").toLowerCase().includes("draw_access_mode")) {
      const fallback = await insertBowl({ owner_id: user.id, name: bowlName });
      newBowl = fallback.data;
      bowlError = fallback.error;
    }

    if (bowlError || !newBowl) {
      console.error("Failed to create bowl", bowlError);
      return createBowlResult({
        ok: false,
        code: "create_failed",
        errorMessage: "Failed to create bowl.",
      });
    }

    publish({ userId: user.id, bowlId: newBowl.id });

    const { error: memberError } = await client
      .from("bowl_members")
      .insert([{ bowl_id: newBowl.id, user_id: user.id, role: "Owner" }]);

    if (memberError) {
      console.error("Failed to add owner membership", memberError);
      return createBowlResult({
        ok: false,
        code: "owner_membership_failed",
        errorMessage: "Failed to add owner membership.",
        bowl: newBowl,
      });
    }

    if (validEmails.length === 0) {
      return createBowlResult({ ok: true, bowl: newBowl });
    }

    const inviteRows = validEmails.map((email) => ({
      bowl_id: newBowl.id,
      invited_email: email,
      invited_by: user.id,
      token: tokenFactory(),
    }));
    const { error: inviteError } = await client.from("bowl_invites").insert(inviteRows);

    if (inviteError) {
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

    const emailResult = await sendEmails(validEmails.map((email, index) => ({
      bowlId: newBowl.id,
      bowlName: newBowl.name,
      invitedEmail: email,
      invitedByEmail: user.email || null,
      token: inviteRows[index].token,
    })));

    let actionMessage;
    if (!emailResult.error && emailResult.failed === 0) {
      actionMessage = `Bowl created and ${emailResult.sent} invite email${emailResult.sent === 1 ? "" : "s"} sent.`;
    } else if (emailResult.sent > 0) {
      actionMessage = `Bowl created, but only ${emailResult.sent} of ${validEmails.length} invite email${validEmails.length === 1 ? "" : "s"} sent.`;
    } else {
      actionMessage = "Bowl created, but invite emails could not be sent. You can still share the invite links from Bowl Settings.";
    }

    return createBowlResult({ ok: true, actionMessage, bowl: newBowl });
  }

  return { create };
}

export const bowlCreationService = createBowlCreationService();
