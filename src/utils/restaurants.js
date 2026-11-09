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

export function countSlips(kind, count) {
  const words = getBowlKindWords(kind);
  return `${count} ${count === 1 ? words.one : words.many}`;
}
