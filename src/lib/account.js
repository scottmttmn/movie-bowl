import { supabase } from "./supabase";

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function deleteMyAccount() {
  try {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (sessionError || !accessToken) {
      return { ok: false, error: "Sign in again before deleting your account." };
    }

    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const result = await parseJsonSafe(response);

    if (!response.ok) {
      return {
        ok: false,
        error: result?.error || `Request failed with ${response.status}`,
        code: result?.code || null,
        bowls: Array.isArray(result?.bowls) ? result.bowls : [],
      };
    }

    // Clear the browser-held token even if the server has already removed its
    // refresh session. The request is intentionally local to this device.
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || "Could not delete your account." };
  }
}
