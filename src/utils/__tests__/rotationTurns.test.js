import { describe, expect, it } from "vitest";
import { getRotationTurns, sortRowsByTurn } from "../rotationTurns";

describe("getRotationTurns", () => {
  it("gives everyone never drawn the first place together", () => {
    const turns = getRotationTurns([
      { bucket_key: "guest:gil", never_drawn: true },
      { bucket_key: "user:b", never_drawn: true },
      { bucket_key: "user:a", never_drawn: false },
      { bucket_key: "user:c", never_drawn: false },
    ]);

    expect(Object.fromEntries(turns)).toEqual({ "guest:gil": 0, "user:b": 0, "user:a": 1, "user:c": 2 });
  });

  it("gives each drawn person a place of their own when nobody is new", () => {
    const turns = getRotationTurns([
      { bucket_key: "user:a", never_drawn: false },
      { bucket_key: "user:b", never_drawn: false },
    ]);

    expect(Object.fromEntries(turns)).toEqual({ "user:a": 0, "user:b": 1 });
  });

  it("has no places without a queue", () => {
    expect(getRotationTurns(null).size).toBe(0);
    expect(getRotationTurns([]).size).toBe(0);
  });
});

describe("sortRowsByTurn", () => {
  const rows = [{ key: "user:a" }, { key: "user:b" }, { key: "user:c" }, { key: "user:d" }];

  it("puts people in line order and keeps anyone out of line after them, as they were", () => {
    const turns = new Map([["user:c", 0], ["user:a", 1]]);

    expect(sortRowsByTurn(rows, turns).map((row) => row.key)).toEqual(["user:c", "user:a", "user:b", "user:d"]);
  });

  it("keeps a tie in the list's own order", () => {
    const turns = new Map([["user:d", 0], ["user:b", 0], ["user:a", 1]]);

    expect(sortRowsByTurn(rows, turns).map((row) => row.key)).toEqual(["user:b", "user:d", "user:a", "user:c"]);
  });

  it("leaves the list alone without an order", () => {
    expect(sortRowsByTurn(rows, null)).toBe(rows);
    expect(sortRowsByTurn(rows, new Map())).toBe(rows);
  });
});
