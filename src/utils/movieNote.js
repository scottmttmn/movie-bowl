export const MAX_MOVIE_NOTE_LENGTH = 500;

export function normalizeMovieNote(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function getMovieNoteValidationError(value) {
  const normalized = normalizeMovieNote(value);
  if (normalized && normalized.length > MAX_MOVIE_NOTE_LENGTH) {
    return `Comment must be ${MAX_MOVIE_NOTE_LENGTH} characters or fewer.`;
  }
  return null;
}
