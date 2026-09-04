import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTvSettingsOverrides,
  mergeTvDrawSettings,
  readTvSettingsOverrides,
  writeTvSettingsOverrides,
} from "../utils/tvDrawSettings";

const KEY = "movie-bowl:tv:draw-settings:user-1";

describe("tvDrawSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("stores only what was changed here, so untouched settings keep following the account", () => {
    writeTvSettingsOverrides("user-1", { prioritizeStreaming: false });

    expect(JSON.parse(window.localStorage.getItem(KEY))).toEqual({
      prioritizeStreaming: false,
    });
    expect(readTvSettingsOverrides("user-1")).toEqual({ prioritizeStreaming: false });
  });

  it("keeps one account's overrides out of another's", () => {
    writeTvSettingsOverrides("user-1", { theaterModeEnabled: true });
    writeTvSettingsOverrides("user-2", { theaterModeEnabled: false });

    expect(readTvSettingsOverrides("user-1")).toEqual({ theaterModeEnabled: true });
    expect(readTvSettingsOverrides("user-2")).toEqual({ theaterModeEnabled: false });
  });

  // Genres, runtime, services and the draw method are deliberately not
  // overridable here, so a value written by a newer build -- or by hand -- does
  // not become one.
  it("refuses settings this surface does not own, and values of the wrong shape", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        prioritizeStreaming: true,
        selectedGenres: ["Drama"],
        runtimeMaxMinutes: 90,
        theaterModeEnabled: "yes",
      })
    );

    expect(readTvSettingsOverrides("user-1")).toEqual({ prioritizeStreaming: true });
  });

  it("treats unreadable storage as a television with no opinions yet", () => {
    window.localStorage.setItem(KEY, "{not json");

    expect(readTvSettingsOverrides("user-1")).toEqual({});
  });

  it("reports a refused write rather than pretending it stuck", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(writeTvSettingsOverrides("user-1", { prioritizeStreaming: false })).toBe(false);
  });

  it("survives storage that throws on the accessor itself", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });

    expect(readTvSettingsOverrides("user-1")).toEqual({});
    expect(writeTvSettingsOverrides("user-1", { prioritizeStreaming: false })).toBe(false);

    Object.defineProperty(window, "localStorage", descriptor);
  });

  it("clears every override at once and leaves nothing behind", () => {
    writeTvSettingsOverrides("user-1", {
      prioritizeStreaming: false,
      theaterModeEnabled: true,
    });

    clearTvSettingsOverrides("user-1");

    expect(readTvSettingsOverrides("user-1")).toEqual({});
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("lays the overrides over the account rather than replacing it", () => {
    const account = {
      prioritizeStreaming: true,
      useStreamingRank: true,
      selectedRatings: ["G", "PG"],
      runtimeMaxMinutes: 120,
    };

    const merged = mergeTvDrawSettings(account, { prioritizeStreaming: false });

    expect(merged.prioritizeStreaming).toBe(false);
    // Everything the television has no opinion about still comes from the phone.
    expect(merged.selectedRatings).toEqual(["G", "PG"]);
    expect(merged.runtimeMaxMinutes).toBe(120);
    expect(merged.useStreamingRank).toBe(true);
  });

  it("normalizes the merged result, so a stale stored value cannot reach the draw", () => {
    const merged = mergeTvDrawSettings({ runtimeMaxMinutes: "not a number" }, {});

    expect(Number.isFinite(merged.runtimeMaxMinutes)).toBe(true);
  });

  it("keeps no state for a signed-out television", () => {
    expect(writeTvSettingsOverrides(null, { prioritizeStreaming: false })).toBe(false);
    expect(readTvSettingsOverrides(null)).toEqual({});
    expect(window.localStorage.length).toBe(0);
  });
});
