// The base a person's movies are built from, shared by search and starter
// packs (output/designs/starter-packs.md). It fetches nothing and filters for
// no product: it only turns TMDB's movie credits into one list per role. Each
// caller adds its own filters on top -- search keeps every feature credit,
// because the half-remembered movie may be a small part; a pack keeps only
// principal roles above a vote floor.

const TV_MOVIE_GENRE_ID = 10770;

function isListableCredit(credit) {
  if (!credit || !Number.isInteger(Number(credit.id)) || Number(credit.id) <= 0) return false;
  if (credit.adult === true) return false;
  // TMDB marks direct-to-video releases; they are not what someone means by
  // "that movie".
  if (credit.video === true) return false;
  // A TV movie is a movie credit with this genre. Shorts carry no such marker
  // here -- only a runtime from each title's details would tell, and a
  // request per credit is not what a filmography is worth.
  if (Array.isArray(credit.genre_ids) && credit.genre_ids.includes(TV_MOVIE_GENRE_ID)) return false;
  return true;
}

function isUncredited(credit) {
  return /\buncredited\b/i.test(String(credit?.character || ""));
}

function byPopularity(a, b) {
  const popularity = (Number(b.popularity) || 0) - (Number(a.popularity) || 0);
  if (popularity !== 0) return popularity;
  const date = String(b.release_date || "").localeCompare(String(a.release_date || ""));
  if (date !== 0) return date;
  return Number(a.id) - Number(b.id);
}

function toMovie(credit, extra = {}) {
  return {
    id: Number(credit.id),
    title: credit.title || credit.original_title || "",
    original_title: credit.original_title || null,
    original_language: credit.original_language || null,
    release_date: credit.release_date || null,
    poster_path: credit.poster_path || null,
    overview: credit.overview || null,
    popularity: Number(credit.popularity) || 0,
    ...extra,
  };
}

export function normalizePersonMovieCredits(credits) {
  const acting = new Map();
  for (const credit of credits?.cast || []) {
    if (!isListableCredit(credit) || isUncredited(credit)) continue;
    const id = Number(credit.id);
    const existing = acting.get(id);
    // One movie can list the same person twice (two characters); keep one row
    // and every name they played.
    if (existing) {
      if (credit.character && !existing.characters.includes(credit.character)) {
        existing.characters.push(credit.character);
      }
      continue;
    }
    acting.set(id, toMovie(credit, { characters: credit.character ? [credit.character] : [] }));
  }

  const directing = new Map();
  for (const credit of credits?.crew || []) {
    // A person's department is not evidence they directed a given movie; the
    // credit's job is.
    if (credit?.job !== "Director" || !isListableCredit(credit)) continue;
    const id = Number(credit.id);
    if (!directing.has(id)) directing.set(id, toMovie(credit));
  }

  return {
    acting: [...acting.values()].sort(byPopularity),
    directing: [...directing.values()].sort(byPopularity),
  };
}
