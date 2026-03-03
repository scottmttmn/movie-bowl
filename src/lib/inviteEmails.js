async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function sendInviteEmails(invites) {
  const normalizedInvites = Array.isArray(invites)
    ? invites.filter((invite) => invite?.invitedEmail && invite?.token)
    : [];

  if (normalizedInvites.length === 0) {
    return { sent: 0, failed: 0, results: [], error: null };
  }

  try {
    const response = await fetch("/api/invites/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ invites: normalizedInvites }),
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

