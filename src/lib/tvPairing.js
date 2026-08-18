export class TvPairingError extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message);
    this.name = "TvPairingError";
    this.status = status;
    this.code = code;
  }
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function postJson(path, { body = {}, accessToken, signal } = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  const data = await readJson(response);

  if (!response.ok && response.status !== 202) {
    throw new TvPairingError(data?.error || "TV pairing failed.", {
      status: response.status,
      code: data?.code || null,
    });
  }

  return data;
}

export function startTvPairing({ signal } = {}) {
  return postJson("/api/tv-pairing/start", { signal });
}

export function pollTvPairing({ deviceId, deviceSecret, signal }) {
  return postJson("/api/tv-pairing/poll", {
    body: { deviceId, deviceSecret },
    signal,
  });
}

export function approveTvPairing({ code, accessToken, signal }) {
  return postJson("/api/tv-pairing/approve", {
    body: { code },
    accessToken,
    signal,
  });
}
