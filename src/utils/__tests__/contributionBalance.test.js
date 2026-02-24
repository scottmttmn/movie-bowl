import { describe, expect, it } from "vitest";
import { checkContributionBalance } from "../contributionBalance";

describe("checkContributionBalance", () => {
  it("blocks when user would exceed max lead", () => {
    const result = checkContributionBalance({
      movies: [
        { added_by: "u1" },
        { added_by: "u1" },
        { added_by: "u2" },
      ],
      memberIds: ["u1", "u2", "u3"],
      userId: "u1",
      maxLead: 2,
    });

    expect(result.allowed).toBe(false);
    expect(result.myCount).toBe(2);
    expect(result.minCount).toBe(0);
  });

  it("allows when user is still within lead", () => {
    const result = checkContributionBalance({
      movies: [{ added_by: "u1" }, { added_by: "u2" }],
      memberIds: ["u1", "u2", "u3"],
      userId: "u1",
      maxLead: 2,
    });

    expect(result.allowed).toBe(true);
    expect(result.myCount).toBe(1);
    expect(result.minCount).toBe(0);
  });

  it("ignores movies added by departed members", () => {
    const result = checkContributionBalance({
      movies: [
        { added_by: "u1" },
        { added_by: "u4" },
        { added_by: "u4" },
        { added_by: "u4" },
      ],
      memberIds: ["u1", "u2"],
      userId: "u1",
      maxLead: 2,
    });

    expect(result.allowed).toBe(true);
    expect(result.myCount).toBe(1);
    expect(result.minCount).toBe(0);
  });

  it("allows while solo, then blocks after a new member joins if over limit", () => {
    const movies = [
      { added_by: "u1" },
      { added_by: "u1" },
      { added_by: "u1" },
      { added_by: "u1" },
    ];

    const beforeJoin = checkContributionBalance({
      movies,
      memberIds: ["u1"],
      userId: "u1",
      maxLead: 1,
    });

    expect(beforeJoin.allowed).toBe(true);
    expect(beforeJoin.myCount).toBe(4);
    expect(beforeJoin.minCount).toBe(4);

    const afterJoin = checkContributionBalance({
      movies,
      memberIds: ["u1", "u2"],
      userId: "u1",
      maxLead: 1,
    });

    expect(afterJoin.allowed).toBe(false);
    expect(afterJoin.myCount).toBe(4);
    expect(afterJoin.minCount).toBe(0);
  });
});
