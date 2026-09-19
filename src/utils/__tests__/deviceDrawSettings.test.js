import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDeviceSettingsOverrides,
  mergeDeviceDrawSettings,
  readDeviceSettingsOverrides,
  writeDeviceSettingsOverrides,
} from "../deviceDrawSettings";
import { DEFAULT_THEATER_TRAILER_COUNT } from "../drawSettings";

const KEY = "movie-bowl:tv:draw-settings:user-1";

describe("deviceDrawSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("stores only what was changed here, so untouched settings keep following the account", () => {
    writeDeviceSettingsOverrides("user-1", { prioritizeStreaming: false });

    expect(JSON.parse(window.localStorage.getItem(KEY))).toEqual({
      prioritizeStreaming: false,
    });
    expect(readDeviceSettingsOverrides("user-1")).toEqual({ prioritizeStreaming: false });
  });

  it("keeps one account's overrides out of another's", () => {
    writeDeviceSettingsOverrides("user-1", { theaterModeEnabled: true });
    writeDeviceSettingsOverrides("user-2", { theaterModeEnabled: false });

    expect(readDeviceSettingsOverrides("user-1")).toEqual({ theaterModeEnabled: true });
    expect(readDeviceSettingsOverrides("user-2")).toEqual({ theaterModeEnabled: false });
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

    expect(readDeviceSettingsOverrides("user-1")).toEqual({ prioritizeStreaming: true });
  });

  // The preview count is the one override that is not a boolean, so its stored
  // shape is checked against the options rather than against a type.
  it("carries the preview count, and only as one of the offered counts", () => {
    writeDeviceSettingsOverrides("user-1", { theaterTrailerCount: 2 });
    expect(readDeviceSettingsOverrides("user-1")).toEqual({ theaterTrailerCount: 2 });

    window.localStorage.setItem(
      KEY,
      JSON.stringify({ theaterTrailerCount: 9, theaterModeEnabled: true })
    );
    expect(readDeviceSettingsOverrides("user-1")).toEqual({ theaterModeEnabled: true });
  });

  // The count is a device setting with no account layer beneath it any more.
  // A profile edited before it moved onto the ticket still carries a number,
  // and a device that inherited it would be running on a value with no control
  // anywhere to see or change it.
  it("takes the count from the device, never from a leftover account value", () => {
    expect(
      mergeDeviceDrawSettings({ theaterTrailerCount: 4 }, { theaterTrailerCount: 1 })
        .theaterTrailerCount
    ).toBe(1);
    expect(
      mergeDeviceDrawSettings({ theaterTrailerCount: 4 }, {}).theaterTrailerCount
    ).toBe(DEFAULT_THEATER_TRAILER_COUNT);
    expect(mergeDeviceDrawSettings({}, {}).theaterTrailerCount).toBe(
      DEFAULT_THEATER_TRAILER_COUNT
    );
  });

  it("treats unreadable storage as a device with no opinions yet", () => {
    window.localStorage.setItem(KEY, "{not json");

    expect(readDeviceSettingsOverrides("user-1")).toEqual({});
  });

  it("reports a refused write rather than pretending it stuck", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(writeDeviceSettingsOverrides("user-1", { prioritizeStreaming: false })).toBe(false);
  });

  it("survives storage that throws on the accessor itself", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });

    expect(readDeviceSettingsOverrides("user-1")).toEqual({});
    expect(writeDeviceSettingsOverrides("user-1", { prioritizeStreaming: false })).toBe(false);

    Object.defineProperty(window, "localStorage", descriptor);
  });

  it("clears every override at once and leaves nothing behind", () => {
    writeDeviceSettingsOverrides("user-1", {
      prioritizeStreaming: false,
      theaterModeEnabled: true,
    });

    clearDeviceSettingsOverrides("user-1");

    expect(readDeviceSettingsOverrides("user-1")).toEqual({});
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("lays the overrides over the account rather than replacing it", () => {
    const account = {
      prioritizeStreaming: true,
      useStreamingRank: true,
      selectedRatings: ["G", "PG"],
      runtimeMaxMinutes: 120,
    };

    const merged = mergeDeviceDrawSettings(account, { prioritizeStreaming: false });

    expect(merged.prioritizeStreaming).toBe(false);
    // Everything the device has no opinion about still comes from the phone.
    expect(merged.selectedRatings).toEqual(["G", "PG"]);
    expect(merged.runtimeMaxMinutes).toBe(120);
    expect(merged.useStreamingRank).toBe(true);
  });

  it("normalizes the merged result, so a stale stored value cannot reach the draw", () => {
    const merged = mergeDeviceDrawSettings({ runtimeMaxMinutes: "not a number" }, {});

    expect(Number.isFinite(merged.runtimeMaxMinutes)).toBe(true);
  });

  it("keeps no state for a signed-out device", () => {
    expect(writeDeviceSettingsOverrides(null, { prioritizeStreaming: false })).toBe(false);
    expect(readDeviceSettingsOverrides(null)).toEqual({});
    expect(window.localStorage.length).toBe(0);
  });

  // The module generalised from the television to every device; the key did
  // not, because renaming it would make every television forget what somebody
  // set in its room. Pinned so a later tidy-up cannot do that silently.
  it("still stores under the key televisions already wrote to", () => {
    writeDeviceSettingsOverrides("user-1", { theaterModeEnabled: true });

    expect(window.localStorage.getItem("movie-bowl:tv:draw-settings:user-1")).not.toBeNull();
  });

  describe("surface defaults", () => {
    // A laptop declining to inherit theater mode is the whole reason this layer
    // exists: enabling it on a phone meant enabling it for a television.
    it("let a surface decline an account setting that does not mean the same thing there", () => {
      const merged = mergeDeviceDrawSettings(
        { theaterModeEnabled: true },
        {},
        { theaterModeEnabled: false }
      );

      expect(merged.theaterModeEnabled).toBe(false);
    });

    it("lose to what somebody set on the device in front of them", () => {
      const merged = mergeDeviceDrawSettings(
        { theaterModeEnabled: true },
        { theaterModeEnabled: true },
        { theaterModeEnabled: false }
      );

      expect(merged.theaterModeEnabled).toBe(true);
    });

    // An override of false and a missing override are different states, and the
    // spread would conflate them if the layer were ordered the other way.
    it("do not resurrect a setting the device turned off", () => {
      const merged = mergeDeviceDrawSettings(
        { theaterModeEnabled: false },
        { theaterModeEnabled: false },
        { theaterModeEnabled: true }
      );

      expect(merged.theaterModeEnabled).toBe(false);
    });

    it("touch nothing they do not name", () => {
      const merged = mergeDeviceDrawSettings(
        { theaterModeEnabled: true, prioritizeStreaming: true, runtimeMaxMinutes: 120 },
        {},
        { theaterModeEnabled: false }
      );

      expect(merged.prioritizeStreaming).toBe(true);
      expect(merged.runtimeMaxMinutes).toBe(120);
    });

    // Omitting them is what the television does, and it must keep inheriting.
    it("leave the account untouched when a surface passes none", () => {
      const merged = mergeDeviceDrawSettings({ theaterModeEnabled: true }, {});

      expect(merged.theaterModeEnabled).toBe(true);
    });
  });
});
