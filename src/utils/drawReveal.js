import {
  getContributorBucketKey,
  getMovieAttributionLabel,
  isStarterPackMovie,
} from "./drawBuckets";
import { getDrawMethod } from "./drawMethods";

// The reveal is a replay of a draw that has already happened, never a
// performance of one. Everything here is derived from the resolved pool and the
// persisted result, so the animation can only show the person and the pile the
// method actually used -- and when the client cannot know one of them, the
// stage is left out rather than guessed at.
// See output/designs/draw-method-reveals.md.

// How long the person stage runs once the result is in. The dashboard waits
// this long before putting the title on the slip, so the person always lands
// first, then holds the title before opening the result. Together they fit
// inside the draw's 1.5s minimum when the result comes back quickly.
export const DRAW_REVEAL_PERSON_MS = 800;
export const DRAW_REVEAL_TITLE_HOLD_MS = 500;
const REDUCED_MOTION_PERSON_MS = 250;

export function getDrawRevealPersonMs(reveal, { reducedMotion = false } = {}) {
  if (!reveal?.person) return 0;
  return reducedMotion ? REDUCED_MOTION_PERSON_MS : DRAW_REVEAL_PERSON_MS;
}

function getMovieFromItem(item) {
  return item?.movie || item;
}

function getPersonLabel(movie) {
  return getMovieAttributionLabel(movie) || "Link Guest";
}

function groupPool(pool) {
  const people = new Map();
  let sharedCount = 0;

  pool.forEach((item) => {
    const movie = getMovieFromItem(item);
    if (!movie) return;
    if (isStarterPackMovie(movie)) {
      sharedCount += 1;
      return;
    }
    const key = getContributorBucketKey(movie);
    const existing = people.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      people.set(key, { key, label: getPersonLabel(movie), count: 1 });
    }
  });

  return { people: Array.from(people.values()), sharedCount };
}

/**
 * Describes the stages of a finished draw for the reveal animation.
 *
 * `person` is null unless the method picks a person first, the chosen person is
 * known, and there was more than one to choose from -- a spin with one name is
 * drama, not information. `title.scope` is where the final pick came from:
 * the chosen person's pile (which includes any pack slips), the whole bowl, or
 * the starter pack. `title.count` is null when the size of that pile is not
 * something this client can know.
 */
export function getDrawReveal({ drawMethod, pool, drawn, turnBucketKey = null }) {
  if (!drawn || !Array.isArray(pool) || pool.length === 0) return null;

  const method = getDrawMethod(drawMethod);

  if (!method.bucketsByContributor) {
    return {
      methodId: method.id,
      person: null,
      title: { mode: "random", scope: "bowl", count: pool.length },
    };
  }

  const { people, sharedCount } = groupPool(pool);

  // Nobody owns an eligible title, so the pack is the draw and no turn is spent.
  if (people.length === 0) {
    return {
      methodId: method.id,
      person: null,
      title: { mode: "random", scope: "pack", count: sharedCount },
    };
  }

  // Person-first reports the turn it spent. Rotation's server does not, so the
  // turn is the drawn slip's contributor -- which a pack slip does not have.
  const chosenKey =
    method.selectionMode === "client"
      ? turnBucketKey
      : isStarterPackMovie(drawn)
        ? null
        : getContributorBucketKey(drawn);
  const chosen = chosenKey ? people.find((person) => person.key === chosenKey) : null;

  if (!chosen) {
    return {
      methodId: method.id,
      person: null,
      title: { mode: "random", scope: "pack", count: null },
    };
  }

  const isPinned = Boolean(method.honorsPin && drawn.is_pinned && !isStarterPackMovie(drawn));

  return {
    methodId: method.id,
    person:
      people.length > 1
        ? {
            mode: method.selectionMode === "server_rotation" ? "turn" : "random",
            people: people.map(({ key, label }) => ({ key, label })),
            chosenKey: chosen.key,
            chosenLabel: chosen.label,
          }
        : null,
    title: {
      mode: isPinned ? "pinned" : "random",
      scope: "person",
      personLabel: chosen.label,
      count: chosen.count + sharedCount,
    },
  };
}

function pluralMovies(count) {
  return `${count} movies`;
}

// What each stage says once it has landed. These describe what happened, not
// the odds: the odds belong to the method's own copy in drawMethods.js.
export function getDrawRevealCopy(reveal) {
  if (!reveal) return { person: "", title: "", announcement: "" };

  const { person, title } = reveal;
  const personLine = person
    ? person.mode === "turn"
      ? `${person.chosenLabel}'s turn`
      : `${person.chosenLabel}, at random`
    : "";

  let titleLine = "";
  if (title.scope === "bowl") {
    titleLine = title.count === 1 ? "The only movie in the bowl" : `1 of ${pluralMovies(title.count)} in the bowl`;
  } else if (title.scope === "pack") {
    titleLine =
      title.count > 1 ? `1 of ${pluralMovies(title.count)} from the starter pack` : "From the starter pack";
  } else if (title.mode === "pinned") {
    titleLine = `${title.personLabel}'s pinned movie`;
  } else if (title.count === 1) {
    titleLine = `${title.personLabel}'s only movie`;
  } else {
    titleLine = `1 of ${title.personLabel}'s ${pluralMovies(title.count)}`;
  }

  return {
    person: personLine,
    title: titleLine,
    announcement: [personLine, titleLine].filter(Boolean).join(". "),
  };
}
