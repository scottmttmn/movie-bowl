import { describe, expect, it } from "vitest";
import {
  buildDrawOddsStats,
  DEFAULT_DRAW_METHOD,
  DRAW_METHOD_OPTIONS,
  getDrawMethod,
  normalizeDrawMethod,
} from "../drawMethods";

// One contributor with many titles and one with a single title is the case the
// two methods are supposed to disagree about.
const LOPSIDED_POOL = [
  { id: "u1-1", added_by: "user-1", profiles: { email: "owner@example.com" } },
  { id: "u1-2", added_by: "user-1", profiles: { email: "owner@example.com" } },
  { id: "u1-3", added_by: "user-1", profiles: { email: "owner@example.com" } },
  { id: "u2-1", added_by: "user-2", profiles: { email: "friend@example.com" } },
];

function makeSequenceRandom(values) {
  const queue = [...values];
  return () => (queue.length > 0 ? queue.shift() : 0);
}

describe("normalizeDrawMethod", () => {
  it("falls back to person-first for anything unrecognized", () => {
    expect(normalizeDrawMethod(null)).toBe(DEFAULT_DRAW_METHOD);
    expect(normalizeDrawMethod(undefined)).toBe(DEFAULT_DRAW_METHOD);
    expect(normalizeDrawMethod("")).toBe(DEFAULT_DRAW_METHOD);
    expect(normalizeDrawMethod("future_method")).toBe(DEFAULT_DRAW_METHOD);
    expect(normalizeDrawMethod("constructor")).toBe(DEFAULT_DRAW_METHOD);
  });

  it("keeps the methods that exist", () => {
    expect(normalizeDrawMethod("person_first")).toBe("person_first");
    expect(normalizeDrawMethod(" title_first ")).toBe("title_first");
    expect(normalizeDrawMethod("rotation")).toBe("rotation");
  });

  it("gives every offered method the copy the UI renders", () => {
    DRAW_METHOD_OPTIONS.forEach((method) => {
      expect(getDrawMethod(method.id)).toBe(method);
      expect(method.label).toBeTruthy();
      expect(method.description).toBeTruthy();
      expect(method.disclosure).toBeTruthy();
      expect(method.tvLabel).toBeTruthy();
      expect(method.selectionMode).toBeTruthy();
      expect(typeof method.honorsPin).toBe("boolean");
    });
    expect(getDrawMethod("person_first").honorsPin).toBe(true);
    expect(getDrawMethod("rotation").honorsPin).toBe(true);
    expect(getDrawMethod("title_first")).toEqual(
      expect.objectContaining({
        honorsPin: false,
        pinNote: expect.stringMatching(/title-first/i),
      })
    );
  });
});

describe("person_first", () => {
  const method = getDrawMethod("person_first");

  it("picks a contributor bucket first, then a title inside it", () => {
    // 0.75 lands on the second of two buckets; 0 takes its first title.
    const selected = method.pick(LOPSIDED_POOL, {
      randomFn: makeSequenceRandom([0.75, 0]),
    });

    expect(selected.id).toBe("u2-1");
  });

  it("gives a one-movie contributor the same odds as a three-movie one", () => {
    const counts = new Map();
    for (let bucketIndex = 0; bucketIndex < 2; bucketIndex += 1) {
      const selected = method.pick(LOPSIDED_POOL, {
        randomFn: makeSequenceRandom([bucketIndex / 2, 0]),
      });
      const contributor = selected.added_by;
      counts.set(contributor, (counts.get(contributor) || 0) + 1);
    }

    expect(counts.get("user-1")).toBe(1);
    expect(counts.get("user-2")).toBe(1);
  });

  it("prefers the pinned title only after choosing its contributor bucket", () => {
    const pool = LOPSIDED_POOL.map((movie) => ({
      ...movie,
      is_pinned: movie.id === "u1-3",
    }));

    const pinnedSelection = method.pick(pool, {
      randomFn: makeSequenceRandom([0, 0]),
    });
    const otherContributorSelection = method.pick(pool, {
      randomFn: makeSequenceRandom([0.75, 0]),
    });

    expect(pinnedSelection.id).toBe("u1-3");
    expect(otherContributorSelection.id).toBe("u2-1");
  });

  it("finds a pin inside wrapped streaming candidates", () => {
    const wrapped = LOPSIDED_POOL.map((movie) => ({
      movie: { ...movie, is_pinned: movie.id === "u1-2" },
      providers: [],
    }));

    expect(
      method.pick(wrapped, { randomFn: makeSequenceRandom([0, 0]) }).movie.id
    ).toBe("u1-2");
  });

  it("reports equal odds per contributor with movie counts", () => {
    expect(buildDrawOddsStats(LOPSIDED_POOL, "person_first")).toEqual([
      {
        bucketKey: "user:user-2",
        member: "friend@example.com",
        movieCount: 1,
        drawOdds: 0.5,
      },
      {
        bucketKey: "user:user-1",
        member: "owner@example.com",
        movieCount: 3,
        drawOdds: 0.5,
      },
    ]);
  });
});

describe("title_first", () => {
  const method = getDrawMethod("title_first");

  it("picks uniformly across every title in the pool", () => {
    const drawn = [0, 0.25, 0.5, 0.75].map((value) =>
      method.pick(LOPSIDED_POOL, { randomFn: makeSequenceRandom([value]) }).id
    );

    expect(drawn).toEqual(["u1-1", "u1-2", "u1-3", "u2-1"]);
  });

  it("reports odds proportional to how many movies each contributor added", () => {
    expect(buildDrawOddsStats(LOPSIDED_POOL, "title_first")).toEqual([
      {
        bucketKey: "user:user-2",
        member: "friend@example.com",
        movieCount: 1,
        drawOdds: 0.25,
      },
      {
        bucketKey: "user:user-1",
        member: "owner@example.com",
        movieCount: 3,
        drawOdds: 0.75,
      },
    ]);
  });

  it("ignores a pin and keeps choosing uniformly across titles", () => {
    const pool = [
      { id: "pinned", added_by: "user-1", is_pinned: true },
      { id: "random-pick", added_by: "user-1", is_pinned: false },
    ];

    expect(
      method.pick(pool, { randomFn: makeSequenceRandom([0.75]) }).id
    ).toBe("random-pick");
  });
});

it("pins do not change reported contributor odds", () => {
  const pinnedPool = LOPSIDED_POOL.map((movie) => ({
    ...movie,
    is_pinned: movie.id === "u1-2" || movie.id === "u2-1",
  }));

  expect(buildDrawOddsStats(pinnedPool, "person_first")).toEqual(
    buildDrawOddsStats(LOPSIDED_POOL, "person_first")
  );
  expect(buildDrawOddsStats(pinnedPool, "title_first")).toEqual(
    buildDrawOddsStats(LOPSIDED_POOL, "title_first")
  );
});

describe("every method", () => {
  const clientMethods = DRAW_METHOD_OPTIONS.filter(
    (method) => method.selectionMode === "client"
  );
  const singleContributorPool = [
    { id: "solo-1", added_by: "user-1" },
    { id: "solo-2", added_by: "user-1" },
  ];

  clientMethods.forEach((method) => {
    it(`${method.id} unwraps the { movie } candidates the streaming path builds`, () => {
      const wrapped = LOPSIDED_POOL.map((movie) => ({ movie, providers: [], bestRank: 0 }));
      const selected = method.pick(wrapped, { randomFn: makeSequenceRandom([0, 0]) });

      expect(selected.movie).toBeDefined();
      expect(selected.providers).toEqual([]);
    });

    it(`${method.id} degenerates to a plain pick for one contributor`, () => {
      const selected = method.pick(singleContributorPool, {
        randomFn: makeSequenceRandom([0.6, 0.6]),
      });

      expect(selected.id).toBe("solo-2");
    });

    it(`${method.id} returns the only movie in a single-movie pool`, () => {
      const selected = method.pick([{ id: "only", added_by: "user-1" }], {
        randomFn: makeSequenceRandom([0.99, 0.99]),
      });

      expect(selected.id).toBe("only");
    });

    it(`${method.id} leaves optimistic rows out of the odds`, () => {
      const stats = buildDrawOddsStats(
        [
          ...LOPSIDED_POOL,
          { id: "pending", added_by: "user-3", local_status: "syncing" },
        ],
        method.id
      );

      expect(stats.map((stat) => stat.bucketKey)).toEqual(["user:user-2", "user:user-1"]);
    });

    it(`${method.id} reports no odds for an empty bowl`, () => {
      expect(buildDrawOddsStats([], method.id)).toEqual([]);
    });
  });
});

describe("rotation", () => {
  const method = getDrawMethod("rotation");

  it("declares server selection and contributor reach without fake client odds", () => {
    expect(method.selectionMode).toBe("server_rotation");
    expect(method.bucketsByContributor).toBe(true);
    expect(method.pick).toBeUndefined();
    expect(buildDrawOddsStats(LOPSIDED_POOL, "rotation")).toEqual([]);
  });
});
