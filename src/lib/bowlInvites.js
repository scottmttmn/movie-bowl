import { supabase } from "./supabase";
import { notifyBowlChange } from "./bowlChanges";
import { describeNetworkError } from "../utils/networkErrors";

export const inviteResult = (ok, code = null, message = null, bowlId = null) => ({ ok, code, message, bowlId });

// Owner-side invitation writes are deliberately funneled through these RPCs.
// The database owns normalization, uniqueness, token generation, idempotency,
// and the acceptance-vs-revoke race; callers only reconcile the outcomes with
// their local UI and email delivery.
export async function createBowlInvitations(
  { bowlId, emails, requestId },
  client = supabase
) {
  return client.rpc("create_bowl_invites", {
    p_bowl_id: bowlId,
    p_emails: emails,
    p_request_id: requestId,
  });
}

export async function revokeBowlInvitation(
  { bowlId, invitationId },
  client = supabase
) {
  return client.rpc("revoke_bowl_invite", {
    p_bowl_id: bowlId,
    p_invitation_id: invitationId,
  });
}

// One acceptance path for the token route and the invite inbox alike. The RPC
// owns membership and finalization together, so neither surface can report a
// half-finished join as success, and neither has to guess what the other did.
// It is also the authority on who the caller is, so there is no client-side
// auth pre-check here to disagree with it.
export async function acceptBowlInvite(token) {
  const { data, error } = await supabase.rpc("accept_bowl_invite", { p_token: token || null });
  if (error) {
    console.error("[bowlInvites] Failed to accept invite", error);
    // The function's own refusals are already written as user-facing sentences.
    if (error.code === "42501") return inviteResult(false, "not_authenticated", error.message);
    if (error.code === "P0001") return inviteResult(false, "invite_unavailable", error.message);
    return inviteResult(false, "accept_failed",
      describeNetworkError(error, "Could not accept this invite. Please try again."));
  }
  // Unscoped on purpose: an acceptance matters to whichever account is loaded,
  // and useUserBowls reads a change without a userId as "refresh regardless".
  notifyBowlChange({ bowlId: data });
  return inviteResult(true, null, null, data);
}
