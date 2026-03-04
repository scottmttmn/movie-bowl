async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Request failed with ${response.status}`);
  }

  return data;
}

export async function discoverRokus(input = {}) {
  const manualIp = String(input.ip || "").trim();
  const query = manualIp ? `?ip=${encodeURIComponent(manualIp)}` : "";
  const data = await apiRequest(`/api/roku/discover${query}`);

  return {
    devices: data?.devices || [],
    setupSteps: data?.setupSteps || [],
    source: data?.source || "discovery",
  };
}

export async function sendMovieToRoku({
  rokuIp,
  title,
  year = null,
  tmdbId = null,
}) {
  return apiRequest("/api/roku/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rokuIp,
      title,
      year,
      tmdbId,
    }),
  });
}

export async function launchPreferredStreamingApp({ rokuIp, userServices, movieProviders }) {
  return apiRequest("/api/roku/launch-app", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rokuIp,
      userServices,
      movieProviders,
    }),
  });
}
