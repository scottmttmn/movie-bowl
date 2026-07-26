import { supabase } from "./supabase";

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function sendInviteEmails(invites) {
  const normalizedInvites = Array.isArray(invites)
    ? invites.filter((invite) => invite?.token)
    : [];

  if (normalizedInvites.length === 0) {
    return { sent: 0, failed: 0, results: [], error: null };
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (sessionError || !accessToken) {
      return {
        sent: 0,
        failed: normalizedInvites.length,
        results: [],
        error: "Sign in to send invite emails.",
      };
    }

    const response = await fetch("/api/invites/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        invites: normalizedInvites.map((invite) => ({ token: invite.token })),
      }),
    });

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      return {
        sent: 0,
        failed: normalizedInvites.length,
        results: [],
        error: data?.error || `Request failed with ${response.status}`,
      };
    }

    return {
      sent: Number(data?.sent || 0),
      failed: Number(data?.failed || 0),
      results: Array.isArray(data?.results) ? data.results : [],
      error: null,
    };
  } catch (error) {
    return {
      sent: 0,
      failed: normalizedInvites.length,
      results: [],
      error: error?.message || "Failed to send invite emails.",
    };
  }
}
