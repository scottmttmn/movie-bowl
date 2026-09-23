import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRememberedValueFor,
  readRememberedReadout,
  rememberReadout,
} from "../rememberedReadouts";

describe("rememberedReadouts", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns what was remembered with the account it was saved for", () => {
    expect(rememberReadout("bowl:1", "user-1", { count: 2 })).toBe(true);

    expect(readRememberedReadout("bowl:1")).toEqual({ userId: "user-1", value: { count: 2 } });
    expect(readRememberedReadout("bowl:2")).toBeNull();
  });

  // A shared device must not open one account's bowl on another's numbers.
  it("keeps a remembered value from any account but the one that saved it", () => {
    rememberReadout("bowl:1", "user-1", { count: 2 });
    const entry = readRememberedReadout("bowl:1");

    expect(getRememberedValueFor(entry, "user-1")).toEqual({ count: 2 });
    expect(getRememberedValueFor(entry, "user-2")).toBeNull();
    // Before the page knows who is signed in, it opens on the entry.
    expect(getRememberedValueFor(entry, null)).toEqual({ count: 2 });
  });

  it("keeps only the most recently settled bowls", () => {
    const now = vi.spyOn(Date, "now");
    for (let index = 0; index < 32; index += 1) {
      now.mockReturnValue(1000 + index);
      rememberReadout(`bowl:${index}`, "user-1", { index });
    }

    expect(readRememberedReadout("bowl:0")).toBeNull();
    expect(readRememberedReadout("bowl:1")).toBeNull();
    expect(readRememberedReadout("bowl:2")).not.toBeNull();
    expect(readRememberedReadout("bowl:31")).not.toBeNull();
  });

  it("degrades to remembering nothing when storage is unreadable or refuses writes", () => {
    window.localStorage.setItem("movie-bowl:remembered-readouts", "{not json");
    expect(readRememberedReadout("bowl:1")).toBeNull();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(rememberReadout("bowl:1", "user-1", { count: 2 })).toBe(false);
  });
});
