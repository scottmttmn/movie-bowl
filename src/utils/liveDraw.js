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
const isCount = (value) => Number.isFinite(value) && value >= 0;
const MAX_PEOPLE = 200;

// One person as the stage reads them: a key and a label, and a count wherever
// one is given. Anything else in the shape makes the whole list unusable.
function parsePeople(raw) {
  if (!Array.isArray(raw) || raw.length > MAX_PEOPLE) return null;
  const people = [];
  for (const entry of raw) {
    if (!isPlainObject(entry) || typeof entry.key !== "string" || !entry.key) return null;
    if (typeof entry.label !== "string") return null;
    if (entry.count !== undefined && !isCount(entry.count)) return null;
    const person = { key: entry.key, label: entry.label.slice(0, MAX_NAME_LENGTH) };
    if (entry.count !== undefined) person.count = entry.count;
    people.push(person);
  }
  return people;
}

// The pool's arrangement, rebuilt from the fields the stage reads, so a
// malformed one is dropped here rather than met by the stage mid-render.
function parsePreview(raw) {
  if (!isPlainObject(raw) || !["people", "bowl"].includes(raw.stage)) return null;
  if (!isCount(raw.total) || (raw.sharedCount !== undefined && !isCount(raw.sharedCount))) return null;
  const people = parsePeople(raw.people);
  if (!people || people.some((person) => person.count === undefined)) return null;
  if (raw.stage === "people" && people.length === 0) return null;
  return {
    methodId: typeof raw.methodId === "string" ? raw.methodId : "",
    stage: raw.stage,
    mode: raw.mode === "turn" ? "turn" : "random",
    people,
    sharedCount: raw.sharedCount ?? 0,
    total: raw.total,
  };
}

function parseRevealPerson(raw) {
  if (raw === null || raw === undefined) return null;
  if (!isPlainObject(raw) || !["turn", "random"].includes(raw.mode)) return undefined;
  if (typeof raw.chosenKey !== "string" || !raw.chosenKey || typeof raw.chosenLabel !== "string") return undefined;
  const people = parsePeople(raw.people);
  if (!people || !people.some((person) => person.key === raw.chosenKey)) return undefined;
  const person = { mode: raw.mode, people, chosenKey: raw.chosenKey, chosenLabel: raw.chosenLabel.slice(0, MAX_NAME_LENGTH) };
  if (raw.queue !== undefined) {
    if (!Array.isArray(raw.queue) || raw.queue.length > MAX_PEOPLE) return undefined;
    if (!raw.queue.every((entry) => isPlainObject(entry) && typeof entry.key === "string" && entry.key)) return undefined;
    person.queue = raw.queue.map((entry) => ({ key: entry.key, neverDrawn: Boolean(entry.neverDrawn) }));
  }
  return person;
}

function parseReveal(raw) {
  if (!isPlainObject(raw) || !isPlainObject(raw.title)) return null;
  const { title } = raw;
  if (!["random", "pinned"].includes(title.mode) || !["person", "bowl", "pack"].includes(title.scope)) return null;
  if (title.count !== null && title.count !== undefined && !isCount(title.count)) return null;
  if (title.personLabel !== undefined && typeof title.personLabel !== "string") return null;
  const person = parseRevealPerson(raw.person);
  if (person === undefined) return null;
  const parsedTitle = { mode: title.mode, scope: title.scope, count: title.count ?? null };
  if (title.personLabel !== undefined) parsedTitle.personLabel = title.personLabel.slice(0, MAX_NAME_LENGTH);
  return { methodId: typeof raw.methodId === "string" ? raw.methodId : "", person, title: parsedTitle };
}

// A newer version is dropped rather than half-understood, and so is any
// preview or reveal the stage could not draw: the movie still opens, just
// without a replay.
export function parseLiveDraw(raw) {
  if (!isPlainObject(raw) || raw.v !== LIVE_DRAW_VERSION) return null;
  if (typeof raw.bowlMovieId !== "string" || !raw.bowlMovieId) return null;
  return {
    bowlMovieId: raw.bowlMovieId,
    title: typeof raw.title === "string" ? raw.title.slice(0, MAX_TITLE_LENGTH) : "",
    methodId: typeof raw.methodId === "string" ? raw.methodId : "",
    preview: parsePreview(raw.preview),
    reveal: parseReveal(raw.reveal),
    drawnBy: typeof raw.drawnBy === "string" ? raw.drawnBy.trim().slice(0, MAX_NAME_LENGTH) : "",
  };
}

// How old a draw can be and still be played as news. Generous, because it is
// the database's clock against this device's, and short next to how long a
// draw stays in the watched list.
export const MAX_ANNOUNCED_DRAW_AGE_MS = 10 * 60 * 1000;

// The drawn copy, once the reloaded bowl shows it was drawn. Null means the
// announcement is not (or not yet) backed by a draw, and nothing should open.
// Only the bowl's newest draw qualifies, only while it is recent, and only once
// per screen: anyone allowed to draw can send an announcement, and without this
// they could make every screen on the bowl replay an old one at will.
export function findAnnouncedDraw(watched, bowlMovieId, { now = Date.now(), played = null } = {}) {
  if (!Array.isArray(watched) || !bowlMovieId) return null;
  const drawnAt = (movie) => Date.parse(movie?.drawn_at || "");
  const newest = watched.reduce((latest, movie) => (
    Number.isFinite(drawnAt(movie)) && (!latest || drawnAt(movie) > drawnAt(latest)) ? movie : latest
  ), null);
  if (!newest || String(newest.bowlMovieId || "") !== String(bowlMovieId)) return null;
  if (Math.abs(now - drawnAt(newest)) > MAX_ANNOUNCED_DRAW_AGE_MS) return null;
  const eventId = newest.drawEventId || newest.id;
  if (!eventId || played?.has(eventId)) return null;
  played?.add(eventId);
  return newest;
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
