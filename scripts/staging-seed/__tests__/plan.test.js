import { describe, expect, it } from "vitest";
import { SEED_BOWLS, checkDetails, memberEmailFor, planBowl, seedTmdbIds } from "../plan.mjs";

const titles = new Map(SEED_BOWLS.flatMap((bowl) => [...bowl.movies.owner, ...bowl.movies.member]));

function tmdbDetails(overrides = {}) {
  return new Map(seedTmdbIds().map((id) => [id, {
    id,
    title: titles.get(id),
    poster_path: `/poster-${id}.jpg`,
    release_date: "2017-11-09",
    runtime: 104,
    genres: [{ id: 35, name: "Comedy" }, { id: 10751, name: "Family" }],
    overview: "An overview.",
    ...overrides[id],
  }]));
}

const people = { ownerId: "owner-id", memberId: "member-id", now: "2026-10-04T12:00:00.000Z" };

describe("staging seed plan", () => {
  it("seeds one bowl per draw method", () => {
    expect(SEED_BOWLS.map((bowl) => bowl.drawMethod).sort()).toEqual(["person_first", "rotation", "title_first"]);
  });

  it("tags the owner's own inbox for the test member", () => {
    expect(memberEmailFor("scott@example.com")).toBe("scott+member@example.com");
    expect(memberEmailFor("scott+staging@example.com")).toBe("scott+member@example.com");
    expect(() => memberEmailFor("not-an-email")).toThrow();
  });

  it("gives a shared bowl two members, an Owner and a Member", () => {
    const plan = planBowl(SEED_BOWLS[0], { ...people, bowlId: "bowl-1", detailsById: tmdbDetails() });
    expect(plan.bowl).toEqual({ id: "bowl-1", name: "Friday Night", owner_id: "owner-id", draw_method: "person_first" });
    expect(plan.members).toEqual([
      { bowl_id: "bowl-1", user_id: "owner-id", role: "Owner" },
      { bowl_id: "bowl-1", user_id: "member-id", role: "Member" },
    ]);
  });

  it("keeps the person-first bowl lopsided, the case person-first exists for", () => {
    const plan = planBowl(SEED_BOWLS[0], { ...people, bowlId: "bowl-1", detailsById: tmdbDetails() });
    const byOwner = plan.movies.filter((movie) => movie.added_by === "owner-id").length;
    const byMember = plan.movies.filter((movie) => movie.added_by === "member-id").length;
    expect(byOwner).toBeGreaterThanOrEqual(byMember * 2);
  });

  it("writes titles the way the app does, genres as names", () => {
    const plan = planBowl(SEED_BOWLS[0], { ...people, bowlId: "bowl-1", detailsById: tmdbDetails() });
    expect(plan.movies[0]).toEqual({
      bowl_id: "bowl-1",
      added_by: "owner-id",
      tmdb_id: 346648,
      title: "Paddington 2",
      poster_path: "/poster-346648.jpg",
      release_date: "2017-11-09",
      runtime: 104,
      genres: ["Comedy", "Family"],
      overview: "An overview.",
      note: null,
      is_pinned: false,
      snapshot_at: people.now,
    });
  });

  it("gives a hand-added slip a negative tmdb_id and nothing from TMDB", () => {
    const plan = planBowl(SEED_BOWLS[0], { ...people, bowlId: "bowl-1", detailsById: tmdbDetails() });
    const custom = plan.movies.find((movie) => movie.title === "Something with Adam Sandler");
    expect(custom.tmdb_id).toBeLessThan(0);
    expect(custom.added_by).toBe("member-id");
    expect(custom.poster_path).toBeUndefined();
  });

  it("puts only the owner in a solo bowl", () => {
    const solo = SEED_BOWLS.find((bowl) => !bowl.withMember);
    const plan = planBowl(solo, { ...people, bowlId: "bowl-3", detailsById: tmdbDetails() });
    expect(plan.members).toHaveLength(1);
    expect(new Set(plan.movies.map((movie) => movie.added_by))).toEqual(new Set(["owner-id"]));
  });

  it("refuses a lookup that names a different film", () => {
    expect(checkDetails(tmdbDetails())).toEqual([]);
    expect(checkDetails(tmdbDetails({ 129: { title: "Not Spirited Away" } }))).toEqual([
      '129: expected "Spirited Away", TMDB says "Not Spirited Away"',
    ]);
  });

  it("fails rather than seeding a title it has no details for", () => {
    const details = tmdbDetails();
    details.delete(603);
    const matrixBowl = SEED_BOWLS.find((bowl) => bowl.movies.owner.some(([id]) => id === 603));
    expect(() => planBowl(matrixBowl, { ...people, bowlId: "bowl-3", detailsById: details })).toThrow(/The Matrix/);
  });
});
