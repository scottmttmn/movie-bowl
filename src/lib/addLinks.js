export async function getAddLinkMetadata(token) {
  const response = await fetch(`/api/add-links/${encodeURIComponent(token)}`);
  const data = await response.json().catch(() => ({}));

  if (response.status === 404 && data?.status === "not_found") {
    return data;
  }

  if (!response.ok) {
    throw new Error(data?.error || "Failed to load add link.");
  }

  return data;
}

export async function consumeAddLink(token, movie, contributorName = "") {
  const response = await fetch("/api/add-links/consume", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, movie, contributorName }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || "Failed to add movie through link.");
  }

  return data;
}
