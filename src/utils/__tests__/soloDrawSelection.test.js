import { describe, expect, it } from "vitest";
import {
  buildSoloPreviewPool,
  filterSoloPoolByScope,
  getSoloDrawGroups,
  getSoloScopeCounts,
  groupSoloCandidatesByTitle,
  selectSoloDrawCandidate,
} from "../soloDrawSelection";

function row(id, overrides = {}) {
  return {
    id,
    bowl_id: "bowl-1",
    tmdb_id: 100,
    title: "Movie",
    is_pinned: false,
    ...overrides,
  };
}

// A sequence of draws, so "uniform" can be asserted as the actual distribution
// rather than a single lucky pick.
function drawEach(candidates, fractions) {
  return fractions.map((fraction) =>
    selectSoloDrawCandidate(candidates, { randomFn: () => fraction })
  );
}

describe("groupSoloCandidatesByTitle", () => {
  it("counts the same movie in several bowls once", () => {
    const groups = groupSoloCandidatesByTitle([
      row("a", { bowl_id: "bowl-1", tmdb_id: 500 }),
      row("b", { bowl_id: "bowl-2", tmdb_id: 500 }),
      row("c", { bowl_id: "bowl-3", tmdb_id: 900 }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.copyCount)).toEqual([2, 1]);
  });

  it("keeps custom titles apart even when their titles match", () => {
    const groups = groupSoloCandidatesByTitle([
      row("a", { tmdb_id: -12, title: "Home Movies" }),
      row("b", { tmdb_id: -34, title: "Home Movies" }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("represents a group by its lowest row id, whatever order the rows arrive in", () => {
    const forwards = groupSoloCandidatesByTitle([
      row("a1", { note: "first copy" }),
      row("b2", { note: "second copy" }),
    ]);
    const backwards = groupSoloCandidatesByTitle([
      row("b2", { note: "second copy" }),
      row("a1", { note: "first copy" }),
    ]);

    expect(forwards[0].movie.note).toBe("first copy");
    expect(backwards[0].movie.note).toBe("first copy");
  });

  it("treats a title pinned in any bowl as pinned", () => {
    const groups = groupSoloCandidatesByTitle([
      row("a", { bowl_id: "bowl-1" }),
      row("b", { bowl_id: "bowl-2", is_pinned: true }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].isPinned).toBe(true);
  });

  it("reads candidates that streaming priority already wrapped", () => {
    const groups = groupSoloCandidatesByTitle([
      { movie: row("a", { tmdb_id: 500 }), providers: [{ provider_name: "Netflix" }] },
      { movie: row("b", { tmdb_id: 700 }), providers: [] },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].candidate.providers).toEqual([{ provider_name: "Netflix" }]);
  });
});

describe("getSoloDrawGroups", () => {
  it("narrows to the pinned titles when any are eligible", () => {
    const groups = getSoloDrawGroups([
      row("a", { tmdb_id: 1, is_pinned: true }),
      row("b", { tmdb_id: 2 }),
      row("c", { tmdb_id: 3, is_pinned: true }),
    ]);

    expect(groups.map((group) => group.movie.id)).toEqual(["a", "c"]);
  });

  it("plays the whole pool when nothing is pinned", () => {
    const groups = getSoloDrawGroups([row("a", { tmdb_id: 1 }), row("b", { tmdb_id: 2 })]);

    expect(groups).toHaveLength(2);
  });
});

describe("buildSoloPreviewPool", () => {
  it("collapses duplicate copies and excludes every copy of the feature", () => {
    const feature = row("feature-b", { bowl_id: "bowl-2", tmdb_id: 500 });
    const preview = buildSoloPreviewPool(
      [
        row("feature-a", { bowl_id: "bowl-1", tmdb_id: 500 }),
        feature,
        row("other-a", { bowl_id: "bowl-1", tmdb_id: 900 }),
        row("other-b", { bowl_id: "bowl-2", tmdb_id: 900 }),
      ],
      { excludeMovie: feature }
    );

    expect(preview.movies).toHaveLength(1);
    expect(preview.movies[0]).toMatchObject({ id: "other-a", tmdb_id: 900 });
    expect(preview.eligibleMovieIds).toBeNull();
  });

  it("maps filtered title identity back to the stable preview representative", () => {
    const preview = buildSoloPreviewPool(
      [
        row("a", { bowl_id: "bowl-1", tmdb_id: 500 }),
        row("b", { bowl_id: "bowl-2", tmdb_id: 500 }),
        row("c", { bowl_id: "bowl-3", tmdb_id: 900 }),
      ],
      { eligibleMovieIds: ["b"] }
    );

    expect(preview.movies.map((movie) => movie.id)).toEqual(["a", "c"]);
    expect(preview.eligibleMovieIds).toEqual(["a"]);
  });

  // Previews follow the filters and streaming priority, as a bowl draw's do.
  // Narrowing them to pins left a lone pinned feature with nothing to rank.
  it("ranks every eligible title whether or not it is pinned", () => {
    const preview = buildSoloPreviewPool(
      [
        row("a", { tmdb_id: 100, is_pinned: true }),
        row("b", { tmdb_id: 200 }),
        row("c", { tmdb_id: 300, is_pinned: true }),
        row("d", { tmdb_id: 400 }),
      ],
      { eligibleMovieIds: ["a", "b", "c"] }
    );

    expect(preview.eligibleMovieIds).toEqual(["a", "b", "c"]);
  });

  it("still ranks the streaming pool after drawing the only pinned title", () => {
    const feature = row("pinned", { tmdb_id: 100, is_pinned: true });
    const preview = buildSoloPreviewPool(
      [feature, row("on-service", { tmdb_id: 200 }), row("elsewhere", { tmdb_id: 300 })],
      { eligibleMovieIds: ["pinned", "on-service"], excludeMovie: feature }
    );

    expect(preview.movies.map((movie) => movie.id)).toEqual(["on-service", "elsewhere"]);
    expect(preview.eligibleMovieIds).toEqual(["on-service"]);
  });
});

describe("selectSoloDrawCandidate", () => {
  it("gives each distinct title the same chance, however many copies it has", () => {
    const candidates = [
      row("a", { bowl_id: "bowl-1", tmdb_id: 500 }),
      row("b", { bowl_id: "bowl-2", tmdb_id: 500 }),
      row("c", { bowl_id: "bowl-3", tmdb_id: 500 }),
      row("d", { bowl_id: "bowl-4", tmdb_id: 900 }),
    ];

    const picks = drawEach(candidates, [0, 0.49, 0.5, 0.99]);

    expect(picks.map((pick) => pick.tmdb_id)).toEqual([500, 500, 900, 900]);
  });

  it("gives each pinned title the same chance, and duplicate pins no extra weight", () => {
    const candidates = [
      row("a", { bowl_id: "bowl-1", tmdb_id: 500, is_pinned: true }),
      row("b", { bowl_id: "bowl-2", tmdb_id: 500, is_pinned: true }),
      row("c", { bowl_id: "bowl-3", tmdb_id: 900, is_pinned: true }),
      row("d", { bowl_id: "bowl-4", tmdb_id: 1300 }),
    ];

    const picks = drawEach(candidates, [0, 0.49, 0.5, 0.99]);

    expect(picks.map((pick) => pick.tmdb_id)).toEqual([500, 500, 900, 900]);
  });

  it("keeps choosing the only eligible pinned title", () => {
    const candidates = [
      row("a", { tmdb_id: 500, is_pinned: true }),
      row("b", { tmdb_id: 900 }),
      row("c", { tmdb_id: 1300 }),
    ];

    const picks = drawEach(candidates, [0, 0.4, 0.99]);

    expect(picks.every((pick) => pick.tmdb_id === 500)).toBe(true);
  });

  it("returns the candidate as it arrived, so resolved providers survive", () => {
    const candidate = { movie: row("a"), providers: [{ provider_name: "Max" }] };

    expect(selectSoloDrawCandidate([candidate], { randomFn: () => 0 })).toBe(candidate);
  });

  it("has nothing to pick from an empty pool", () => {
    expect(selectSoloDrawCandidate([], { randomFn: () => 0 })).toBeNull();
    expect(selectSoloDrawCandidate(null, { randomFn: () => 0 })).toBeNull();
  });

  // Math.random() is [0, 1), but an injected randomFn in a test or a future
  // caller need not be, and an out-of-range index would draw nothing at all.
  it("stays inside the pool when randomFn returns its bounds", () => {
    const candidates = [row("a", { tmdb_id: 1 }), row("b", { tmdb_id: 2 })];

    expect(selectSoloDrawCandidate(candidates, { randomFn: () => 1 })).toBeTruthy();
    expect(selectSoloDrawCandidate(candidates, { randomFn: () => -1 })).toBeTruthy();
  });
});

describe("getSoloScopeCounts", () => {
  it("counts slips per bowl, not distinct titles", () => {
    const counts = getSoloScopeCounts([
      row("a", { bowl_id: "bowl-1", tmdb_id: 500 }),
      row("b", { bowl_id: "bowl-1", tmdb_id: 900 }),
      row("c", { bowl_id: "bowl-2", tmdb_id: 500 }),
    ]);

    expect(counts.get("bowl-1")).toBe(2);
    expect(counts.get("bowl-2")).toBe(1);
  });
});

describe("filterSoloPoolByScope", () => {
  it("keeps only the selected bowls", () => {
    const rows = [
      row("a", { bowl_id: "bowl-1" }),
      row("b", { bowl_id: "bowl-2" }),
      row("c", { bowl_id: "bowl-3" }),
    ];

    expect(filterSoloPoolByScope(rows, ["bowl-1", "bowl-3"]).map((movie) => movie.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("selects nothing when no bowl is chosen", () => {
    expect(filterSoloPoolByScope([row("a")], [])).toEqual([]);
    expect(filterSoloPoolByScope([row("a")], null)).toEqual([]);
  });
});
