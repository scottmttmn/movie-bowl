// What a draw announces on its bowl's live channel, and what a listener will
// accept. The channel is only a nudge: whoever plays an announced draw reloads
// the bowl first and opens nothing the database does not show was drawn, so
// a malformed or invented announcement can at worst be ignored.

import { getContributorBucketKey, isStarterPackMovie } from "./drawBuckets";

export const LIVE_DRAW_VERSION = 1;
const MAX_TITLE_LENGTH = 300;
const MAX_NAME_LENGTH = 80;

export function getBowlLiveTopic(bowlId) {
  return bowlId ? `bowl-live:${bowlId}` : null;
}

export function buildLiveDraw({ bowlMovieId, title, methodId, preview = null, reveal = null, drawnBy = "" }) {
  if (!bowlMovieId) return null;
  return {
    v: LIVE_DRAW_VERSION,
    bowlMovieId: String(bowlMovieId),
    title: String(title || "").slice(0, MAX_TITLE_LENGTH),
    methodId: String(methodId || ""),
    preview: preview && typeof preview === "object" ? preview : null,
    reveal: reveal && typeof reveal === "object" ? reveal : null,
    drawnBy: String(drawnBy || "").trim().slice(0, MAX_NAME_LENGTH),
  };
}

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// A newer version is dropped rather than half-understood; the reveal shapes are
// checked only as far as the stage reads them, so an odd one falls back to no
// replay rather than a broken one.
export function parseLiveDraw(raw) {
  if (!isPlainObject(raw) || raw.v !== LIVE_DRAW_VERSION) return null;
  if (typeof raw.bowlMovieId !== "string" || !raw.bowlMovieId) return null;
  const preview = isPlainObject(raw.preview) && Array.isArray(raw.preview.people) ? raw.preview : null;
  const reveal = isPlainObject(raw.reveal) && isPlainObject(raw.reveal.title) ? raw.reveal : null;
  return {
    bowlMovieId: raw.bowlMovieId,
    title: typeof raw.title === "string" ? raw.title.slice(0, MAX_TITLE_LENGTH) : "",
    methodId: typeof raw.methodId === "string" ? raw.methodId : "",
    preview,
    reveal,
    drawnBy: typeof raw.drawnBy === "string" ? raw.drawnBy.trim().slice(0, MAX_NAME_LENGTH) : "",
  };
}

// The drawn copy, once the reloaded bowl shows it was drawn. Null means the
// announcement is not (or not yet) backed by a draw, and nothing should open.
export function findAnnouncedDraw(watched, bowlMovieId) {
  if (!Array.isArray(watched) || !bowlMovieId) return null;
  return watched.find((movie) => String(movie?.bowlMovieId || "") === String(bowlMovieId)) || null;
}

// The announced reveal, if it agrees with the draw the database recorded. A
// person-first or rotation reveal names whose pile the title came from; for an
// owned slip that has to be its contributor, or the replay would land on
// someone the draw did not pick, so it is left out and the movie simply opens.
// A pack slip belongs to no one and spends whichever turn the draw chose, which
// only the drawing screen knew.
export function verifyAnnouncedReveal(reveal, drawn) {
  if (!reveal || !drawn) return null;
  const chosenKey = reveal.person?.chosenKey;
  if (!chosenKey || isStarterPackMovie(drawn)) return reveal;
  return chosenKey === getContributorBucketKey(drawn) ? reveal : null;
}
