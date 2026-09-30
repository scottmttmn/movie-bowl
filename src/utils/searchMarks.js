// What the add sheet already knows about a search result: whether the title is
// waiting in the bowl being added to, whether you have watched it, or whether
// it is waiting in another of your bowls. Only titles with a real TMDB id can
// match, because only those are the same film on both sides.

// One undrawn slip per title per bowl is today's rule, so a title anyone has
// put in the bowl cannot be added again. The planned "one slip per person"
// (output/designs/pinned-movie.md) relaxes that to your own slip only; the mark
// already records whose slip it is, so that change is this one flag.
export const ONE_SLIP_PER_TITLE = true;

function positiveTmdbId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Indexes slips and watch history by TMDB id for one destination bowl.
 * `slips` are undrawn `bowl_movies` rows from any of your bowls; `watchEvents`
 * are your own `user_watch_events`; `bowls` supply names for other bowls, in
 * the order the bowl picker shows them.
 */
export function buildSearchMarks({ bowlId, userId, bowls = [], slips = [], watchEvents = [] }) {
  const bowlOrder = new Map(bowls.map((bowl, index) => [bowl.id, index]));
  const marks = new Map();
  const markFor = (tmdbId) => {
    if (!marks.has(tmdbId)) marks.set(tmdbId, { inBowl: null, watchedOn: null, otherBowl: null });
    return marks.get(tmdbId);
  };

  for (const slip of slips) {
    const tmdbId = positiveTmdbId(slip?.tmdb_id);
    // A pack slip is nobody's yet: adding the title is how you claim it.
    if (tmdbId == null || slip.starter_pack) continue;
    if (slip.bowl_id === bowlId) {
      const mark = markFor(tmdbId);
      if (mark.inBowl !== "mine") mark.inBowl = slip.added_by === userId ? "mine" : "theirs";
    } else if (bowlOrder.has(slip.bowl_id)) {
      const mark = markFor(tmdbId);
      const current = mark.otherBowl ? bowlOrder.get(mark.otherBowl.id) : Infinity;
      if (bowlOrder.get(slip.bowl_id) < current) mark.otherBowl = bowls[bowlOrder.get(slip.bowl_id)];
    }
  }

  for (const event of watchEvents) {
    const tmdbId = positiveTmdbId(event?.tmdb_id);
    if (tmdbId == null || !event.watched_on) continue;
    const mark = markFor(tmdbId);
    // ISO dates compare as strings; the latest viewing is the one worth showing.
    if (!mark.watchedOn || event.watched_on > mark.watchedOn) mark.watchedOn = event.watched_on;
  }

  return marks;
}

/**
 * The one mark a result shows, strongest first: already in this bowl, then
 * watched, then in another bowl. `blocksAdd` is whether adding would be
 * refused, which is what takes the + away.
 */
export function getSearchMark(marks, movie) {
  const tmdbId = positiveTmdbId(movie?.tmdb_id ?? movie?.id);
  const mark = tmdbId == null ? null : marks?.get(tmdbId);
  if (!mark) return null;
  if (mark.inBowl) {
    return { kind: "in_bowl", owner: mark.inBowl, blocksAdd: mark.inBowl === "mine" || ONE_SLIP_PER_TITLE };
  }
  if (mark.watchedOn) return { kind: "watched", watchedOn: mark.watchedOn, blocksAdd: false };
  if (mark.otherBowl) return { kind: "other_bowl", bowl: mark.otherBowl, blocksAdd: false };
  return null;
}

const SAME_YEAR = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const OTHER_YEAR = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });
const SPOKEN = new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" });

// watched_on is a calendar date, so it is read as local midnight; parsed as an
// ISO string it would be UTC and land a day early west of Greenwich.
function parseCalendarDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

// The stub has room for a few characters: the day this year, the month before.
export function formatWatchedStub(value, now = new Date()) {
  const date = parseCalendarDate(value);
  if (!date) return null;
  return (date.getFullYear() === now.getFullYear() ? SAME_YEAR : OTHER_YEAR).format(date);
}

export function formatWatchedSpoken(value) {
  const date = parseCalendarDate(value);
  return date ? SPOKEN.format(date) : null;
}
