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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Google's times are instants; the sheet reads them on the restaurant's own
// clock, which is the one its door keeps, wherever the phone is. The returned
// date's UTC fields are that wall clock. The place's time zone answers across
// a daylight-saving change; its current offset, the fallback, does not.
function onPlaceClock(ms, details) {
  if (details.timeZone) {
    try {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
          timeZone: details.timeZone,
          hourCycle: "h23",
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
        }).formatToParts(new Date(ms)).map((part) => [part.type, Number(part.value)])
      );
      return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
    } catch {
      // A zone this browser does not know: the offset below is close enough.
    }
  }
  const offset = Number.isInteger(details.utcOffsetMinutes) ? details.utcOffsetMinutes : 0;
  return new Date(ms + offset * 60_000);
}

function clockTime(date) {
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const hour = hours % 12 || 12;
  return `${hour}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${hours < 12 ? "AM" : "PM"}`;
}

function dayDistance(from, to) {
  const day = (date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((day(to) - day(from)) / 86_400_000);
}

// "Open until 9 PM", "Closed · opens tomorrow 11 AM": what the drawn sheet
// says about the door right now, or null when Google said nothing usable.
export function describeOpenStatus(details, now = Date.now()) {
  if (!details) return null;
  if (details.closedForGood) return { tone: "gone", text: "Closed for good" };
  const here = onPlaceClock(now, details);
  if (details.openNow === true) {
    if (!details.nextCloseTime) return { tone: "open", text: "Open now" };
    return { tone: "open", text: `Open until ${clockTime(onPlaceClock(Date.parse(details.nextCloseTime), details))}` };
  }
  if (details.openNow === false) {
    if (!details.nextOpenTime) return { tone: "closed", text: "Closed now" };
    const opens = onPlaceClock(Date.parse(details.nextOpenTime), details);
    const days = dayDistance(here, opens);
    const day = days <= 0 ? "" : days === 1 ? "tomorrow " : `${WEEKDAYS[opens.getUTCDay()]} `;
    return { tone: "closed", text: `Closed · opens ${day}${clockTime(opens)}` };
  }
  return null;
}
