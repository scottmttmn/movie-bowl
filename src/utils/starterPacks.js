// Starter packs, in our own terms (output/designs/starter-packs.md). Nothing
// here came from TMDB: a filmography pack names a person, a role and a decade,
// and the Best Picture list is the Academy's public record written down by us.
// What each pack holds is asked of TMDB at the moment an owner installs it,
// and nothing about the answer is kept -- TMDB content may not be cached past
// six months or stored as a derived list, and this repository is public.

import { nameWords } from "./peopleMatch.js";

// A bowl holds at most this many undrawn titles from its pack. The database
// enforces it; the client samples within it.
export const STARTER_PACK_MAX_SLIPS = 15;

// Below this many votes a credit is a curiosity rather than a movie people
// know, and it would fill a pack with cameos and festival shorts.
export const STARTER_PACK_MIN_VOTES = 100;
// Top-billed only: a filmography pack is the movies someone led, not every
// movie they appeared in.
export const STARTER_PACK_PRINCIPAL_BILLING = 2;
const DOCUMENTARY_GENRE_ID = 99;

function decadeLabel(decade) {
  return `The '${String(decade).slice(2)}s`;
}

function filmography(slug, displayName, person, role, decade) {
  return {
    slug,
    kind: "filmography",
    name: `${displayName}: ${decadeLabel(decade)}`,
    person,
    role,
    decade,
  };
}

function bestPicture(decade) {
  return {
    slug: `best-picture-${decade}s`,
    kind: "best-picture",
    name: `Best Picture Winners: ${decadeLabel(decade)}`,
    decade,
  };
}

export const STARTER_PACKS = [
  filmography("spielberg-1970s", "Spielberg", "Steven Spielberg", "directing", 1970),
  filmography("spielberg-1980s", "Spielberg", "Steven Spielberg", "directing", 1980),
  filmography("spielberg-1990s", "Spielberg", "Steven Spielberg", "directing", 1990),
  filmography("spielberg-2000s", "Spielberg", "Steven Spielberg", "directing", 2000),
  filmography("hitchcock-1950s", "Hitchcock", "Alfred Hitchcock", "directing", 1950),
  filmography("scorsese-1990s", "Scorsese", "Martin Scorsese", "directing", 1990),
  filmography("nolan-2000s", "Nolan", "Christopher Nolan", "directing", 2000),
  filmography("nolan-2010s", "Nolan", "Christopher Nolan", "directing", 2010),
  filmography("hughes-1980s", "John Hughes", "John Hughes", "directing", 1980),
  filmography("hanks-1990s", "Tom Hanks", "Tom Hanks", "acting", 1990),
  filmography("ford-1980s", "Harrison Ford", "Harrison Ford", "acting", 1980),
  filmography("roberts-1990s", "Julia Roberts", "Julia Roberts", "acting", 1990),
  filmography("washington-2000s", "Denzel Washington", "Denzel Washington", "acting", 2000),
  ...[1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map(bestPicture),
];

// Best Picture winners by the year of the film, not of the ceremony. Updated
// by hand once a year; it currently runs through the 2024 films.
export const BEST_PICTURE_WINNERS = [
  ["All About Eve", 1950], ["An American in Paris", 1951], ["The Greatest Show on Earth", 1952],
  ["From Here to Eternity", 1953], ["On the Waterfront", 1954], ["Marty", 1955],
  ["Around the World in 80 Days", 1956], ["The Bridge on the River Kwai", 1957], ["Gigi", 1958],
  ["Ben-Hur", 1959], ["The Apartment", 1960], ["West Side Story", 1961],
  ["Lawrence of Arabia", 1962], ["Tom Jones", 1963], ["My Fair Lady", 1964],
  ["The Sound of Music", 1965], ["A Man for All Seasons", 1966], ["In the Heat of the Night", 1967],
  ["Oliver!", 1968], ["Midnight Cowboy", 1969], ["Patton", 1970],
  ["The French Connection", 1971], ["The Godfather", 1972], ["The Sting", 1973],
  ["The Godfather Part II", 1974], ["One Flew Over the Cuckoo's Nest", 1975], ["Rocky", 1976],
  ["Annie Hall", 1977], ["The Deer Hunter", 1978], ["Kramer vs. Kramer", 1979],
  ["Ordinary People", 1980], ["Chariots of Fire", 1981], ["Gandhi", 1982],
  ["Terms of Endearment", 1983], ["Amadeus", 1984], ["Out of Africa", 1985],
  ["Platoon", 1986], ["The Last Emperor", 1987], ["Rain Man", 1988],
  ["Driving Miss Daisy", 1989], ["Dances with Wolves", 1990], ["The Silence of the Lambs", 1991],
  ["Unforgiven", 1992], ["Schindler's List", 1993], ["Forrest Gump", 1994],
  ["Braveheart", 1995], ["The English Patient", 1996], ["Titanic", 1997],
  ["Shakespeare in Love", 1998], ["American Beauty", 1999], ["Gladiator", 2000],
  ["A Beautiful Mind", 2001], ["Chicago", 2002], ["The Lord of the Rings: The Return of the King", 2003],
  ["Million Dollar Baby", 2004], ["Crash", 2005], ["The Departed", 2006],
  ["No Country for Old Men", 2007], ["Slumdog Millionaire", 2008], ["The Hurt Locker", 2009],
  ["The King's Speech", 2010], ["The Artist", 2011], ["Argo", 2012],
  ["12 Years a Slave", 2013], ["Birdman or (The Unexpected Virtue of Ignorance)", 2014], ["Spotlight", 2015],
  ["Moonlight", 2016], ["The Shape of Water", 2017], ["Green Book", 2018],
  ["Parasite", 2019], ["Nomadland", 2020], ["CODA", 2021],
  ["Everything Everywhere All at Once", 2022], ["Oppenheimer", 2023], ["Anora", 2024],
].map(([title, year]) => ({ title, year }));

export function getStarterPack(slug) {
  return STARTER_PACKS.find((pack) => pack.slug === slug) || null;
}

function releaseYear(movie) {
  const year = Number(String(movie?.release_date || "").slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}

function inDecade(movie, decade) {
  const year = releaseYear(movie);
  return year !== null && year >= decade && year < decade + 10;
}

export function bestPictureWinnersFor(decade) {
  return BEST_PICTURE_WINNERS.filter((winner) => winner.year >= decade && winner.year < decade + 10);
}

function sameName(a, b) {
  return nameWords(a).join(" ") === nameWords(b).join(" ");
}

/**
 * Which of TMDB's people search results is the pack's person. Exactly one
 * exact name wins; with several, the one known for the pack's role does; any
 * other outcome is a failure the caller reports rather than a guess.
 */
export function choosePackPerson(pack, people) {
  const named = (Array.isArray(people) ? people : []).filter((person) => person && sameName(person.name, pack.person));
  if (named.length === 1) return { person: named[0] };
  if (named.length === 0) return { error: `No one named ${pack.person} was found.` };
  const department = pack.role === "directing" ? "Directing" : "Acting";
  const inRole = named.filter((person) => person.known_for_department === department);
  if (inRole.length === 1) return { person: inRole[0] };
  return { error: `More than one ${pack.person} was found.` };
}

/**
 * The pack's own filters over the shared credits base: the role, principal
 * billing for acting, a vote floor, no documentaries, the decade.
 */
export function selectFilmographyCandidates(pack, credits) {
  const movies = pack.role === "directing" ? credits?.directing : credits?.acting;
  return (Array.isArray(movies) ? movies : []).filter((movie) => {
    if (!inDecade(movie, pack.decade)) return false;
    if ((Number(movie.vote_count) || 0) < STARTER_PACK_MIN_VOTES) return false;
    if (Array.isArray(movie.genre_ids) && movie.genre_ids.includes(DOCUMENTARY_GENRE_ID)) return false;
    if (pack.role === "acting") {
      // A credit with no billing order is not evidence of a lead.
      if (!Number.isInteger(movie.billing) || movie.billing > STARTER_PACK_PRINCIPAL_BILLING) return false;
    }
    return true;
  });
}

/**
 * The winner among TMDB's search results for its title: the one film with that
 * exact title from that year, else from a year either side -- release dates
 * drift by festival and region -- and otherwise a failure, never a guess.
 */
export function matchBestPictureWinner(winner, results) {
  const titled = (Array.isArray(results) ? results : []).filter((movie) => movie && movie.adult !== true
    && (sameName(movie.title, winner.title) || sameName(movie.original_title, winner.title)));
  const exactYear = titled.filter((movie) => releaseYear(movie) === winner.year);
  if (exactYear.length === 1) return { movie: exactYear[0] };
  if (exactYear.length > 1) return { error: `More than one ${winner.title} (${winner.year}) was found.` };
  const nearYear = titled.filter((movie) => Math.abs((releaseYear(movie) ?? 0) - winner.year) === 1);
  if (nearYear.length === 1) return { movie: nearYear[0] };
  return { error: `${winner.title} (${winner.year}) was not found.` };
}

// What an install or "pull more" offers: up to `count` of the pack's
// candidates, chosen at random from the ones the bowl has never held --
// neither in it now nor drawn from it -- so topping up never brings back a
// title the group has already watched.
export function sampleStarterPackCandidates(candidates, {
  excludeTmdbIds = [],
  count = STARTER_PACK_MAX_SLIPS,
  randomFn = Math.random,
} = {}) {
  const excluded = new Set([...excludeTmdbIds].map(Number));
  const pool = (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => Number(candidate?.id) > 0 && !excluded.has(Number(candidate.id)));
  // A partial Fisher-Yates: only the first `count` positions are shuffled.
  const picks = [...pool];
  const size = Math.min(Math.max(0, count), picks.length);
  for (let index = 0; index < size; index += 1) {
    const swap = index + Math.floor(randomFn() * (picks.length - index));
    [picks[index], picks[swap]] = [picks[swap], picks[index]];
  }
  return picks.slice(0, size);
}

// The filmography packs as the people they belong to, in the order they are
// listed: one entry per person and role, holding that person's packs by
// decade. The shelf shows one card per entry, and the photo lookup asks about
// each person once.
export function groupFilmographyPacks(packs = STARTER_PACKS) {
  const groups = new Map();
  packs.filter((pack) => pack.kind === "filmography").forEach((pack) => {
    const key = `${pack.role}:${pack.person}`;
    if (!groups.has(key)) groups.set(key, { person: pack.person, role: pack.role, packs: [] });
    groups.get(key).packs.push(pack);
  });
  return Array.from(groups.values());
}

// A pack's decade as the shelf writes it on a button or a slip: '80s.
export function starterPackDecade(pack) {
  return `'${String(pack.decade).slice(2)}s`;
}

// What a pack will put in, said before anyone presses the button.
export function describeStarterPack(pack) {
  const years = `${pack.decade} to ${pack.decade + 9}`;
  if (pack.kind === "best-picture") {
    const winners = bestPictureWinnersFor(pack.decade).length;
    return `All ${winners} Best Picture winners from ${years}. Anything already in the bowl is skipped.`;
  }
  const verb = pack.role === "directing" ? "directed" : "led";
  return `Up to ${STARTER_PACK_MAX_SLIPS} of the movies ${pack.person} ${verb} from ${years}, picked at random. Anything already in the bowl is skipped.`;
}

// The three an empty bowl offers before anyone opens the full shelf: a
// director, the Oscars and a newer director, so the first choice is between
// kinds of night rather than between near neighbours.
export const STARTER_PACK_SUGGESTIONS = ["spielberg-1980s", "best-picture-1990s", "nolan-2000s"]
  .map((slug) => getStarterPack(slug));
