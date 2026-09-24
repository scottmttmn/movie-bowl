import { getContributorBucketKey, isStarterPackMovie } from "./drawBuckets";

export const DEFAULT_DRAW_METHOD = "person_first";

// Selection runs on both raw bowl_movies rows and the { movie, providers }
// wrappers the streaming-priority path builds, so every method unwraps first.
function getMovieFromItem(item) {
  return item?.movie || item;
}

function pickUniform(items, randomFn) {
  const index = Math.floor(randomFn() * items.length);
  return items[index];
}

// People's piles, keyed by contributor, with the pack's slips kept apart: they
// join whichever pile is chosen rather than being one.
function groupByContributor(items) {
  const buckets = new Map();
  const shared = [];

  items.forEach((item) => {
    const movie = getMovieFromItem(item);
    if (isStarterPackMovie(movie)) {
      shared.push(item);
      return;
    }
    const bucketKey = getContributorBucketKey(movie);
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey).push(item);
  });

  return { buckets: Array.from(buckets.entries()), shared };
}

// A person, uniformly, then a title from their pile plus the pack's, the pin
// first. When nobody has an eligible title the pack is the draw, and no one's
// turn is spent. The turn is returned so a pack win can be recorded as the
// person's: a bowl that later switches to rotation needs to know.
function choosePersonFirst(pool, randomFn) {
  const { buckets, shared } = groupByContributor(pool);
  if (buckets.length === 0) {
    return { selected: pickUniform(shared, randomFn), turnBucketKey: null };
  }
  const [turnBucketKey, bucket] = pickUniform(buckets, randomFn);
  const pinned = bucket.find((item) => getMovieFromItem(item)?.is_pinned);
  return {
    selected: pinned || pickUniform([...bucket, ...shared], randomFn),
    turnBucketKey,
  };
}

const PERSON_FIRST = {
  id: "person_first",
  label: "Person-first",
  tvLabel: "Person-first random draw",
  description:
    "Picks a person at random, then one of their movies. Everyone is equally likely, no matter how many movies they added.",
  // Steps rather than a paragraph: the mechanism is two ordered choices, and
  // showing them as two makes the promise legible without spelling it out --
  // pins appear only under step two, so they visibly cannot change who is picked.
  steps: [
    { title: "A person, at random", note: "Everyone equally likely, however many movies they added" },
    { title: "One of their movies", note: "Their pinned movie if they picked one" },
  ],
  // Equal odds are a promise about people, so a filter that removes everything
  // one person added quietly removes them from the draw. Say so.
  bucketsByContributor: true,
  reachCaveat: "",
  honorsPin: true,
  selectionMode: "client",
  choose(pool, { randomFn = Math.random } = {}) {
    return choosePersonFirst(pool, randomFn);
  },
  pick(pool, { randomFn = Math.random } = {}) {
    return choosePersonFirst(pool, randomFn).selected;
  },
};

const TITLE_FIRST = {
  id: "title_first",
  label: "Title-first",
  tvLabel: "Title-first random draw",
  description:
    "Picks a title at random from the whole bowl. Adding more movies means more chances to be drawn.",
  steps: [
    { title: "One title, at random", note: "From the whole bowl, so more movies means more chances" },
  ],
  footnote: "Pins do nothing here — there is no per-person step to apply them to.",
  bucketsByContributor: false,
  reachCaveat: "",
  honorsPin: false,
  pinNote: "This bowl draws title-first, so pins don't change anything here.",
  selectionMode: "client",
  pick(pool, { randomFn = Math.random } = {}) {
    return pickUniform(pool, randomFn);
  },
};

const ROTATION = {
  id: "rotation",
  label: "Rotation",
  tvLabel: "Contributor rotation",
  description:
    "Picks someone who has waited longest, then randomly chooses one of their eligible movies.",
  steps: [
    { title: "Whoever has waited longest", note: "Never drawn goes first, then least recently drawn. Ties are random." },
    { title: "One of their movies", note: "Their pinned movie if they picked one" },
  ],
  footnote: "Returning a movie does not reset the turn.",
  bucketsByContributor: true,
  reachCaveat: "They rejoin when one of their movies is eligible again.",
  honorsPin: true,
  selectionMode: "server_rotation",
};

const DRAW_METHODS = {
  [PERSON_FIRST.id]: PERSON_FIRST,
  [TITLE_FIRST.id]: TITLE_FIRST,
  [ROTATION.id]: ROTATION,
};

// Display order for the Bowl Settings control; the default leads.
export const DRAW_METHOD_OPTIONS = [PERSON_FIRST, TITLE_FIRST, ROTATION];

// A bowl row written by a newer deploy must not break an older client still
// open in someone's tab, so anything unrecognized reads as the default.
export function normalizeDrawMethod(value) {
  const key = String(value ?? "").trim();
  return Object.prototype.hasOwnProperty.call(DRAW_METHODS, key) ? key : DEFAULT_DRAW_METHOD;
}

export function getDrawMethod(value) {
  return DRAW_METHODS[normalizeDrawMethod(value)];
}

// The pick plus whose turn it spent, for a client-selected method. Only a
// method with turns reports one.
export function chooseWithMethod(method, pool, options) {
  if (typeof method.choose === "function") return method.choose(pool, options);
  return { selected: method.pick(pool, options), turnBucketKey: null };
}
