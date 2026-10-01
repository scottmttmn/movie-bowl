import { describe, expect, it } from "vitest";
import { buildBowlPeopleRows } from "../bowlPeople";

const MOVIES = [
  { id: "m1", added_by: "u1" },
  { id: "m2", added_by: "u1" },
  { id: "m3", added_by: "u2" },
  { id: "m4", added_by_name: "Robin" },
  { id: "m5", starter_pack: "classics" },
  { id: "m6", added_by: "u2", local_status: "syncing" },
];
const MEMBERS = [
  { userId: "u2", role: "Member", displayName: "Sam" },
  { userId: "u3", role: "Member", displayName: "Ana" },
  { userId: "u1", role: "Owner", displayName: "Alex" },
];

describe("buildBowlPeopleRows", () => {
  it("lists the owner first, then members by name, then link guests, with what each has in the bowl", () => {
    const rows = buildBowlPeopleRows({ members: MEMBERS, movies: MOVIES, ownerId: "u1", currentUserId: "u2" });

    expect(rows.map((row) => [row.name, row.count])).toEqual([
      ["Alex", 2],
      ["Ana", 0],
      ["Sam", 1],
      ["Robin", 1],
    ]);
    expect(rows[0]).toMatchObject({ isOwner: true, isYou: false, initial: "A" });
    expect(rows[2]).toMatchObject({ isOwner: false, isYou: true });
    // With no filtered pool to compare against, nobody is left out.
    expect(rows.some((row) => row.isLeftOut)).toBe(false);
  });

  it("adds back an owner an older bowl never gave a membership row", () => {
    const members = MEMBERS.filter((member) => member.userId !== "u1");
    const rows = buildBowlPeopleRows({ members, movies: MOVIES, ownerId: "u1", ownerName: "Alex" });

    expect(rows[0]).toMatchObject({ key: "user:u1", name: "Alex", isOwner: true, count: 2 });
    expect(rows.filter((row) => row.key === "user:u1")).toHaveLength(1);
  });

  it("counts only the filtered pool and marks someone whose every movie it removed", () => {
    const rows = buildBowlPeopleRows({ members: MEMBERS, movies: MOVIES, eligibleMovieIds: ["m3", "m4"], ownerId: "u1" });
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));

    expect(byName.Alex).toMatchObject({ count: 0, isLeftOut: true });
    expect(byName.Sam).toMatchObject({ count: 1, isLeftOut: false });
    // Ana added nothing, which is not the same as being filtered out.
    expect(byName.Ana).toMatchObject({ count: 0, isLeftOut: false });
  });

  it("names a member with no display name the way every other surface does", () => {
    const [row] = buildBowlPeopleRows({ members: [{ userId: "abcdef12", role: "Member", displayName: null }] });
    expect(row.name).toMatch(/^Member/);
  });
});
