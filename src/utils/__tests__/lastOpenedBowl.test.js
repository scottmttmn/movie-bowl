import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetLastOpenedBowl,
  getLastOpenedBowlId,
  rememberLastOpenedBowl,
} from "../lastOpenedBowl";

describe("lastOpenedBowl", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("returns an empty string when nothing is remembered", () => {
    expect(getLastOpenedBowlId("u1")).toBe("");
  });

  it("round-trips a bowl id for a user", () => {
    rememberLastOpenedBowl("u1", "bowl-1");
    expect(getLastOpenedBowlId("u1")).toBe("bowl-1");
  });

  it("scopes remembered bowls per user", () => {
    rememberLastOpenedBowl("u1", "bowl-1");
    rememberLastOpenedBowl("u2", "bowl-2");

    expect(getLastOpenedBowlId("u1")).toBe("bowl-1");
    expect(getLastOpenedBowlId("u2")).toBe("bowl-2");
  });

  it("forgets only the requested user's bowl", () => {
    rememberLastOpenedBowl("u1", "bowl-1");
    rememberLastOpenedBowl("u2", "bowl-2");

    forgetLastOpenedBowl("u1");

    expect(getLastOpenedBowlId("u1")).toBe("");
    expect(getLastOpenedBowlId("u2")).toBe("bowl-2");
  });

  it("ignores missing user or bowl ids", () => {
    rememberLastOpenedBowl("", "bowl-1");
    rememberLastOpenedBowl("u1", "");

    expect(getLastOpenedBowlId("u1")).toBe("");
    expect(getLastOpenedBowlId("")).toBe("");
  });

  it("degrades to no memory when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    expect(() => rememberLastOpenedBowl("u1", "bowl-1")).not.toThrow();
    expect(getLastOpenedBowlId("u1")).toBe("");
  });
});
