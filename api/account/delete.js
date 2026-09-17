import { getSupabaseAdmin } from "../_lib/supabaseAdmin.js";

function getBearerToken(req) {
  const authorization = req.headers?.authorization || req.headers?.Authorization;
  if (typeof authorization !== "string") return null;
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (error) {
    console.error("[api/account/delete] Missing Supabase configuration", error);
    res.status(500).json({ error: "Account deletion is not configured." });
    return;
  }

  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  const user = authData?.user;
  if (authError || !user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const { data: cleanup, error: cleanupError } = await admin.rpc(
    "delete_account_data_for_user",
    { p_user_id: user.id, p_email: user.email || null }
  );

  if (cleanupError) {
    console.error("[api/account/delete] Failed to remove account data", cleanupError);
    res.status(500).json({ error: "Could not delete the account data." });
    return;
  }

  if (cleanup?.code === "owned_bowls") {
    res.status(409).json({
      error: "Transfer or delete every bowl you own before deleting your account.",
      code: "owned_bowls",
      bowls: Array.isArray(cleanup.owned_bowls) ? cleanup.owned_bowls : [],
    });
    return;
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id, false);
  if (deleteUserError) {
    console.error("[api/account/delete] Failed to delete Auth user", deleteUserError);
    res.status(500).json({
      error: "Your account data was removed, but sign-in deletion did not finish. Please try again.",
    });
    return;
  }

  res.status(200).json({ deleted: true });
}
