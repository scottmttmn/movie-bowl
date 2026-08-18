const STORAGE_KEY = "movie-bowl:tv:external-return";
const MAX_RETURN_AGE_MS = 30 * 60 * 1000;

function getStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberExternalReturn({ bowlId, movie }) {
  if (!bowlId || !movie?.id || !movie?.title) return;

  try {
    getStorage()?.setItem(
      STORAGE_KEY,
      JSON.stringify({ bowlId, movie, savedAt: Date.now() })
    );
  } catch {
    // A provider launch should still work when storage is unavailable.
  }
}

export function readExternalReturn(bowlId) {
  const storage = getStorage();
  if (!storage || !bowlId) return null;

  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
    const isFresh =
      Number.isFinite(value?.savedAt) &&
      Date.now() - value.savedAt <= MAX_RETURN_AGE_MS;
    const isUsableMovie = Boolean(value?.movie?.id && value?.movie?.title);

    if (value?.bowlId === bowlId && isFresh && isUsableMovie) {
      return value.movie;
    }

    storage.removeItem(STORAGE_KEY);
  } catch {
    storage.removeItem(STORAGE_KEY);
  }

  return null;
}

export function clearExternalReturn() {
  try {
    getStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Clearing stale navigation state is best-effort.
  }
}
