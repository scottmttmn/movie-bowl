import {
  getContributorBucketKey,
  getMovieAttributionLabel,
  isStarterPackMovie,
} from "./drawBuckets";
import { getDrawMethod } from "./drawMethods";

// The reveal is a replay of a draw that has already happened, never a
// performance of one. Everything that lands is derived from the resolved pool
// and the persisted result, so the animation can only show the person and the
// pile the method actually used -- and when the client cannot know one of them,
// the stage is left out rather than guessed at.
//
// What plays before the result is allowed to be busy but never to land: the
// pool is known before the request goes out, so the slips can rise and sort
// into piles, and a light can sweep across real names, while the draw is in
// flight. Nothing settles on anyone until the result is in.
// See output/designs/draw-method-reveals.md.

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
 * What the reveal can show before the result exists: the pool, arranged the way
 * the method is about to choose from it. `stage` is "people" when the method
 * picks a person first and there is more than one to pick from -- the slips
 * sort into one pile each -- and "bowl" otherwise, when every slip rises as one
 * crowd. It says nothing about who or what will be drawn.
 */
export function getDrawRevealPreview({ drawMethod, pool }) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const method = getDrawMethod(drawMethod);
  const { people, sharedCount } = groupPool(pool);
  const byPerson = method.bucketsByContributor && people.length > 1;
  return {
    methodId: method.id,
    stage: byPerson ? "people" : "bowl",
    mode: method.selectionMode === "server_rotation" ? "turn" : "random",
    people: byPerson ? people : [],
    sharedCount,
    total: pool.length,
  };
}

// Rotation's queue comes back from the database in the order the locked draw
// ranked it. Only entries for people in this pool are kept, and the drawn
// person must be first, or the line would be showing something the draw did
// not do.
function getRotationQueue(rotationQueue, people, chosenKey) {
  if (!Array.isArray(rotationQueue) || rotationQueue.length === 0) return null;
  const known = new Set(people.map((person) => person.key));
  const queue = rotationQueue
    .filter((entry) => entry && known.has(entry.bucket_key))
    .map((entry) => ({ key: entry.bucket_key, neverDrawn: Boolean(entry.never_drawn) }));
  if (queue.length !== people.length || queue[0]?.key !== chosenKey) return null;
  return queue;
}

/**
 * Describes the stages of a finished draw for the reveal animation.
 *
 * `person` is null unless the method picks a person first, the chosen person is
 * known, and there was more than one to choose from -- a spin with one name is
 * drama, not information. Rotation's person carries `queue`, the order the
 * draw ranked everyone in, when the database reported one. `title.scope` is
 * where the final pick came from: the chosen person's pile (which includes any
 * pack slips), the whole bowl, or the starter pack. `title.count` is null when
 * the size of that pile is not something this client can know.
 */
export function getDrawReveal({ drawMethod, pool, drawn, turnBucketKey = null, rotationQueue = null }) {
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

  // Both methods now report the turn they spent. A rotation result from before
  // the database did falls back to the drawn slip's contributor, which a pack
  // slip does not have.
  const isRotation = method.selectionMode === "server_rotation";
  const chosenKey = turnBucketKey
    || (isRotation && !isStarterPackMovie(drawn) ? getContributorBucketKey(drawn) : null);
  const chosen = chosenKey ? people.find((person) => person.key === chosenKey) : null;

  if (!chosen) {
    return {
      methodId: method.id,
      person: null,
      title: { mode: "random", scope: "pack", count: null },
    };
  }

  const isPinned = Boolean(method.honorsPin && drawn.is_pinned && !isStarterPackMovie(drawn));
  let person = null;
  if (people.length > 1) {
    person = {
      mode: isRotation ? "turn" : "random",
      people,
      chosenKey: chosen.key,
      chosenLabel: chosen.label,
    };
    const queue = isRotation ? getRotationQueue(rotationQueue, people, chosen.key) : null;
    if (queue) person.queue = queue;
  }

  return {
    methodId: method.id,
    person,
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
  if (title.scope === "solo") {
    const noun = title.pinnedPool ? "favorite" : "title";
    titleLine = title.count === 1 ? `Your only eligible ${noun}` : `1 of your ${title.count} ${noun}s`;
  } else if (title.scope === "bowl") {
    titleLine = title.count === 1 ? "The only movie in the bowl" : `1 of ${pluralMovies(title.count)} in the bowl`;
  } else if (title.scope === "pack") {
    titleLine =
      title.count > 1 ? `1 of ${pluralMovies(title.count)} from the starter pack` : "From the starter pack";
  } else if (title.mode === "pinned") {
    titleLine = `${title.personLabel}'s favorite`;
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

// A mocked or pre-preview result can arrive with a reveal and no preview. The
// reveal holds everything the preview would have, so the stage never has to
// wait on one that is not coming.
function getPreviewFromReveal(reveal) {
  if (!reveal) return null;
  if (reveal.person) {
    return {
      methodId: reveal.methodId,
      stage: "people",
      mode: reveal.person.mode,
      people: reveal.person.people.map((entry) => ({ count: 1, ...entry })),
      sharedCount: 0,
      total: reveal.person.people.reduce((sum, entry) => sum + (entry.count || 1), 0),
    };
  }
  return {
    methodId: reveal.methodId,
    stage: "bowl",
    mode: "random",
    people: [],
    sharedCount: 0,
    total: reveal.title?.count || 0,
    ...(reveal.title?.scope === "solo" ? { scope: "solo", pinnedPool: Boolean(reveal.title.pinnedPool) } : {}),
  };
}

// Stage lengths in milliseconds. The pending stages claim nothing, so a draw
// that answers quickly is still shown whole, and one that answers slowly
// spends the wait on stages that were going to play anyway.
const FULL = {
  rise: 450, arrange: 1000, loop: 600, sweep: 1300, lineup: 600, turn: 700,
  land: 450, fan: 500, pick: 400, pinlift: 500, flicker: 1300, pluck: 500, unfold: 700,
};
// With reduced motion nothing flies or sweeps; each stage cross-fades in place
// and holds long enough to read.
const REDUCED = {
  rise: 0, arrange: 150, loop: 250, sweep: 350, lineup: 350, turn: 350,
  land: 350, fan: 0, pick: 350, pinlift: 350, flicker: 350, pluck: 350, unfold: 500,
};

// Without a reveal there is nothing to replay, so the draw opens as it always
// did: no sooner than this, and as soon as the result is in after it.
export const DRAW_REVEAL_FALLBACK_OPEN_MS = 1500;

/**
 * The reveal's schedule, in milliseconds from the start of the draw, as far as
 * it can be known. Before the pool is resolved only the opening stages are
 * scheduled; before the result, only the stages that claim nothing. Once the
 * reveal is in, `openAt` is when the drawn movie opens -- which the dashboard
 * waits for, so the animation and the result can never disagree about when the
 * show is over.
 *
 * The first stage that lands never starts before `resultAt`.
 */
export function getDrawRevealTimeline({
  preview = null,
  previewAt = null,
  reveal = null,
  resultAt = null,
  reducedMotion = false,
} = {}) {
  const T = reducedMotion ? REDUCED : FULL;
  const phases = [{ name: "gather", at: 0 }];
  if (T.rise) phases.push({ name: "rise", at: FULL.rise });

  const shape = preview || getPreviewFromReveal(reveal);
  const shapeAt = preview ? previewAt ?? 0 : resultAt;
  if (!shape || shapeAt === null) {
    const openAt = !reveal && resultAt !== null ? Math.max(DRAW_REVEAL_FALLBACK_OPEN_MS, resultAt) : null;
    return { stage: null, preview: null, phases, openAt };
  }

  const arrangeAt = Math.max(T.arrange, shapeAt);
  const loopAt = arrangeAt + T.loop;
  phases.push({ name: "arrange", at: arrangeAt }, { name: "loop", at: loopAt });

  if (!reveal || resultAt === null) {
    // A result with nothing to replay opens as it always did.
    const openAt = !reveal && resultAt !== null ? Math.max(DRAW_REVEAL_FALLBACK_OPEN_MS, resultAt) : null;
    return { stage: shape.stage, preview: shape, phases, openAt };
  }

  let at = Math.max(loopAt, resultAt);
  const add = (name, duration) => {
    phases.push({ name, at });
    at += duration;
  };

  if (reveal.person && shape.stage === "people") {
    if (reveal.person.mode === "turn") {
      if (reveal.person.queue) add("lineup", T.lineup);
      add("turn", T.turn);
    } else {
      add("sweep", T.sweep);
    }
    add("land", T.land);
    if (reveal.title.mode === "pinned") {
      add("pinlift", T.pinlift);
    } else {
      if (reveal.title.count !== 1 && T.fan) add("fan", T.fan);
      add("pick", T.pick);
    }
  } else {
    add("flicker", T.flicker);
    add("pluck", T.pluck);
  }
  add("unfold", T.unfold);

  return { stage: shape.stage, preview: shape, phases, openAt: at };
}

const PERSON_LANDED = new Set(["land", "fan", "pick", "pinlift", "unfold"]);
const TITLE_LANDED = new Set(["pick", "pinlift", "pluck", "unfold"]);

// Which stages have landed by `phase`. The caption and the screen reader say a
// stage only once the animation has shown it.
export function getDrawRevealProgress(reveal, phase) {
  if (!reveal) return { personLanded: false, titleLanded: false };
  const personLanded = Boolean(reveal.person)
    && (PERSON_LANDED.has(phase) || (reveal.person.mode === "turn" && phase === "turn"));
  return { personLanded, titleLanded: TITLE_LANDED.has(phase) };
}

// What the polite status says: the stages that have landed, in order.
export function getDrawRevealAnnouncement(reveal, phase) {
  const { personLanded, titleLanded } = getDrawRevealProgress(reveal, phase);
  const copy = getDrawRevealCopy(reveal);
  return [personLanded ? copy.person : "", titleLanded ? copy.title : ""].filter(Boolean).join(". ");
}

// The phase showing at `elapsed`, for a timeline built by getDrawRevealTimeline.
export function getDrawRevealPhaseAt(timeline, elapsed) {
  let current = "idle";
  for (const phase of timeline.phases) {
    if (phase.at <= elapsed) current = phase.name;
  }
  return current;
}
