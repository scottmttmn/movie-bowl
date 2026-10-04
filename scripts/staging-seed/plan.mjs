// What the staging seed puts in a staging account, as plain data. Kept apart
// from the script that writes it so the shape can be tested without a
// database: run.mjs looks the titles up and writes these rows.
//
// Three bowls, one per draw method, so each method can be tried on staging
// without setting anything up. The shared ones hold a second member, and the
// person-first bowl is lopsided on purpose: one person adding twice as many
// titles is exactly the case person-first exists to keep fair.
export const SEED_BOWLS = [
  {
    name: "Friday Night",
    drawMethod: "person_first",
    withMember: true,
    movies: {
      owner: [
        [346648, "Paddington 2"],
        [120467, "The Grand Budapest Hotel"],
        [129, "Spirited Away"],
        [546554, "Knives Out"],
        [76341, "Mad Max: Fury Road"],
        [2493, "The Princess Bride"],
      ],
      member: [
        [329865, "Arrival"],
        [545611, "Everything Everywhere All at Once"],
      ],
      // A hand-added slip: a wish rather than a film, with no TMDB entry.
      memberCustom: ["Something with Adam Sandler"],
    },
  },
  {
    name: "Rotation Club",
    drawMethod: "rotation",
    withMember: true,
    movies: {
      owner: [
        [496243, "Parasite"],
        [371645, "Hunt for the Wilderpeople"],
        [105, "Back to the Future"],
      ],
      member: [
        [2062, "Ratatouille"],
        [419430, "Get Out"],
        [376867, "Moonlight"],
      ],
      memberCustom: [],
    },
  },
  {
    name: "Just Me",
    drawMethod: "title_first",
    withMember: false,
    movies: {
      owner: [
        [354912, "Coco"],
        [27205, "Inception"],
        [603, "The Matrix"],
        [862, "Toy Story"],
      ],
      member: [],
      memberCustom: [],
    },
  },
];

export const MEMBER_DISPLAY_NAME = "Robin (test)";

// The second member's address: the owner's own inbox with a +member tag, so
// nothing is ever sent anywhere new.
export function memberEmailFor(ownerEmail) {
  const [local, domain] = String(ownerEmail).split("@");
  if (!local || !domain) throw new Error(`Not an email address: ${ownerEmail}`);
  return `${local.split("+")[0]}+member@${domain}`;
}

export function seedTmdbIds() {
  return [...new Set(SEED_BOWLS.flatMap((bowl) => [...bowl.movies.owner, ...bowl.movies.member].map(([id]) => id)))];
}

// The same fields the app writes when someone adds a title (lib/addBowlMovie.js).
export function movieRow({ bowlId, addedBy, details, now }) {
  return {
    bowl_id: bowlId,
    added_by: addedBy,
    tmdb_id: details.id,
    title: details.title.trim(),
    poster_path: details.poster_path ?? null,
    release_date: details.release_date || null,
    runtime: details.runtime ?? null,
    genres: (details.genres || []).map((genre) => genre?.name).filter(Boolean),
    overview: details.overview ?? null,
    note: null,
    is_pinned: false,
    snapshot_at: now,
  };
}

// A custom slip carries a negative synthetic tmdb_id and nothing else.
export function customRow({ bowlId, addedBy, title, index, now }) {
  return {
    bowl_id: bowlId,
    added_by: addedBy,
    tmdb_id: -(1_000_000 + index),
    title,
    note: null,
    is_pinned: false,
    snapshot_at: now,
  };
}

/**
 * Every row one bowl needs, given who the people are and the TMDB details of
 * each title. Bowls the account already has by name are skipped by the caller,
 * so running the seed twice adds nothing.
 */
export function planBowl(bowl, { bowlId, ownerId, memberId, detailsById, now }) {
  const members = [{ bowl_id: bowlId, user_id: ownerId, role: "Owner" }];
  if (bowl.withMember) members.push({ bowl_id: bowlId, user_id: memberId, role: "Member" });
  const rows = (entries, addedBy) => entries.map(([id, expectedTitle]) => {
    const details = detailsById.get(id);
    if (!details) throw new Error(`No TMDB details for ${expectedTitle} (${id}).`);
    return movieRow({ bowlId, addedBy, details, now });
  });
  const movies = [
    ...rows(bowl.movies.owner, ownerId),
    ...(bowl.withMember ? rows(bowl.movies.member, memberId) : []),
    ...(bowl.withMember
      ? bowl.movies.memberCustom.map((title, index) => customRow({ bowlId, addedBy: memberId, title, index, now }))
      : []),
  ];
  return {
    bowl: { id: bowlId, name: bowl.name, owner_id: ownerId, draw_method: bowl.drawMethod },
    members,
    movies,
  };
}

// A wrong id would seed the wrong film under the right name, so the lookup is
// checked against the title it is meant to be.
export function checkDetails(detailsById) {
  const wrong = [];
  for (const bowl of SEED_BOWLS) {
    for (const [id, expectedTitle] of [...bowl.movies.owner, ...bowl.movies.member]) {
      const actual = detailsById.get(id)?.title;
      if (actual !== expectedTitle) wrong.push(`${id}: expected "${expectedTitle}", TMDB says "${actual ?? "nothing"}"`);
    }
  }
  return wrong;
}
