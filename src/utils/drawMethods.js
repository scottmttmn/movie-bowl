import { getContributorBucketKey, getContributorBucketLabel } from "./drawBuckets";

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

function groupByContributor(items) {
  const buckets = new Map();

  items.forEach((item) => {
    const bucketKey = getContributorBucketKey(getMovieFromItem(item));
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey).push(item);
  });

  return Array.from(buckets.values()).filter((bucket) => bucket.length > 0);
}

// Odds are reported per contributor whatever the method, so the methods differ
// only in how they turn the counts into a share.
function buildContributorCounts(movies) {
  const buckets = new Map();

  (movies || []).forEach((movie) => {
    // Optimistic rows are excluded from draws until they persist, so they are
    // excluded from the odds that describe those draws.
    if (!movie || movie.local_status === "syncing") return;
    const key = getContributorBucketKey(movie);
    if (!buckets.has(key)) {
      buckets.set(key, {
        bucketKey: key,
        member: getContributorBucketLabel(movie),
        movieCount: 0,
        drawOdds: 0,
      });
    }
    buckets.get(key).movieCount += 1;
  });

  return Array.from(buckets.values()).sort((a, b) => a.member.localeCompare(b.member));
}

const PERSON_FIRST = {
  id: "person_first",
  label: "Person-first",
  description:
    "Picks a person at random, then one of their movies. Everyone is equally likely, no matter how many movies they added.",
  disclosure:
    "The bowl first selects a person at random, then selects one of their movies at random. Each person is equally likely to be selected, regardless of how many movies they added.",
  // Equal odds are a promise about people, so a filter that removes everything
  // one person added quietly removes them from the draw. Say so.
  bucketsByContributor: true,
  reachCaveat:
    "Equal odds only cover the people with a movie in the actual eligible pool. Rating, genre, runtime, and streaming settings can remove every title someone added, leaving that person out of the draw.",
  pick(pool, { randomFn = Math.random } = {}) {
    const buckets = groupByContributor(pool);
    return pickUniform(pickUniform(buckets, randomFn), randomFn);
  },
  buildOdds(movies) {
    const stats = buildContributorCounts(movies);
    const bucketCount = stats.length;
    return stats.map((stat) => ({
      ...stat,
      drawOdds: bucketCount > 0 ? 1 / bucketCount : 0,
    }));
  },
};

const TITLE_FIRST = {
  id: "title_first",
  label: "Title-first",
  description:
    "Picks a title at random from the whole bowl. Adding more movies means more chances to be drawn.",
  disclosure:
    "The bowl selects one title at random from everything in it. Every movie is equally likely, so someone who added more movies is more likely to have one of theirs drawn.",
  bucketsByContributor: false,
  reachCaveat:
    "Only movies in the actual eligible pool are in the running. Rating, genre, runtime, and streaming settings can remove every title someone added, leaving that person out of the draw.",
  pick(pool, { randomFn = Math.random } = {}) {
    return pickUniform(pool, randomFn);
  },
  buildOdds(movies) {
    const stats = buildContributorCounts(movies);
    const movieCount = stats.reduce((total, stat) => total + stat.movieCount, 0);
    return stats.map((stat) => ({
      ...stat,
      drawOdds: movieCount > 0 ? stat.movieCount / movieCount : 0,
    }));
  },
};

const DRAW_METHODS = {
  [PERSON_FIRST.id]: PERSON_FIRST,
  [TITLE_FIRST.id]: TITLE_FIRST,
};

// Display order for the Bowl Settings control; the default leads.
export const DRAW_METHOD_OPTIONS = [PERSON_FIRST, TITLE_FIRST];

// A bowl row written by a newer deploy must not break an older client still
// open in someone's tab, so anything unrecognized reads as the default.
export function normalizeDrawMethod(value) {
  const key = String(value ?? "").trim();
  return Object.prototype.hasOwnProperty.call(DRAW_METHODS, key) ? key : DEFAULT_DRAW_METHOD;
}

export function getDrawMethod(value) {
  return DRAW_METHODS[normalizeDrawMethod(value)];
}

export function buildDrawOddsStats(movies = [], drawMethod = DEFAULT_DRAW_METHOD) {
  return getDrawMethod(drawMethod).buildOdds(movies);
}
