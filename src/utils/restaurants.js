// Restaurant bowls: a second kind of bowl whose slips are places to eat.
// See output/designs/restaurant-bowls.md.

export const BOWL_KINDS = Object.freeze({ movies: "movies", restaurants: "restaurants" });

// The chips the add sheet offers when a restaurant is added by name. Google's
// own types replace them once search lands; a hand-added slip keeps its chip.
export const RESTAURANT_CUISINES = Object.freeze([
  "American", "Pizza", "Mexican", "Chinese", "Italian", "Mediterranean",
  "Pub", "Cafe", "Thai", "Sushi", "Indian", "BBQ",
]);

// Mirrors the database's checks, so the sheet refuses what the table would.
export const MAX_RESTAURANT_NAME_LENGTH = 120;
export const MAX_CUISINE_LENGTH = 40;

export function normalizeBowlKind(kind) {
  return kind === BOWL_KINDS.restaurants ? BOWL_KINDS.restaurants : BOWL_KINDS.movies;
}

export function isRestaurantKind(kind) {
  return normalizeBowlKind(kind) === BOWL_KINDS.restaurants;
}

// A slip with no cuisine, or one the chips do not name, is filed under Other
// so the filter can still leave it in or out.
export const OTHER_CUISINE = "Other";

export function getCuisineKey(slip) {
  const cuisine = normalizeCuisine(slip?.cuisine);
  return cuisine && RESTAURANT_CUISINES.includes(cuisine) ? cuisine : OTHER_CUISINE;
}

// The chips the filter offers: the cuisines this bowl actually holds, in the
// add sheet's order, with Other last.
export function getCuisineChoices(slips) {
  const present = new Set((Array.isArray(slips) ? slips : []).map(getCuisineKey));
  return [...RESTAURANT_CUISINES, OTHER_CUISINE].filter((key) => present.has(key));
}

// The filter is what is left out, so a cuisine added to the bowl later is in
// the draw until someone says otherwise.
export function filterSlipsByCuisine(slips, cuisineFilter) {
  const list = Array.isArray(slips) ? slips : [];
  const excluded = new Set(cuisineFilter?.excluded || []);
  if (excluded.size === 0) return list;
  return list.filter((slip) => !excluded.has(getCuisineKey(slip)));
}

export function normalizeCuisine(value) {
  const cuisine = String(value ?? "").trim().replace(/\s+/g, " ");
  return cuisine ? cuisine.slice(0, MAX_CUISINE_LENGTH) : null;
}

// Without a place id this is a search by name, which is what a person would
// type into Maps anyway; with one, Maps opens that exact place.
export function getRestaurantDirectionsUrl(slip) {
  const name = String(slip?.title || "").trim();
  if (!name) return null;
  const params = new URLSearchParams({ api: "1", query: name });
  if (slip?.place_id) params.set("query_place_id", slip.place_id);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

// Every bowl-wide word that names what the bowl holds, in one place, so a
// restaurant bowl never reads "movie" and a movie bowl never changes.
const WORDS = {
  movies: {
    one: "movie", many: "movies", mine: "My Movies", drawn: "Watched",
    add: "Add a movie", reveal: "Reveal a movie?", revealAction: "Reveal Movie",
    empty: "You have no movies in this section.",
  },
  restaurants: {
    one: "restaurant", many: "restaurants", mine: "My Restaurants", drawn: "Been there",
    add: "Add a restaurant", reveal: "Reveal a restaurant?", revealAction: "Reveal",
    empty: "You have no restaurants in this section.",
  },
};

export function getBowlKindWords(kind) {
  return WORDS[normalizeBowlKind(kind)];
}

// Copy written once for movie bowls -- the draw methods' steps and caveats --
// read in a restaurant bowl's own word. Movie copy passes through untouched.
export function inBowlWords(kind, text) {
  if (!isRestaurantKind(kind) || typeof text !== "string") return text;
  // "Movie Bowl" and "Title-first" are names and stay; every other movie or title is a
  // restaurant in a restaurant bowl.
  return text
    .replace(/\b(movie|title)(s?)\b(?! Bowl|-)/gi, (word, _noun, plural) => {
      const noun = word[0] === word[0].toUpperCase() ? "Restaurant" : "restaurant";
      return `${noun}${plural}`;
    });
}

export function countSlips(kind, count) {
  const words = getBowlKindWords(kind);
  return `${count} ${count === 1 ? words.one : words.many}`;
}
