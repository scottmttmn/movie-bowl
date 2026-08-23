import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OFFLINE_MESSAGE,
  describeNetworkError,
  isOffline,
  isOfflineError,
} from "../networkErrors";

function setOnLine(value) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(value);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isOffline", () => {
  it("reports offline only when the browser says so explicitly", () => {
    setOnLine(false);
    expect(isOffline()).toBe(true);
  });

  it("assumes online when the browser reports a connection", () => {
    setOnLine(true);
    expect(isOffline()).toBe(false);
  });

  it("assumes online when onLine is not a boolean", () => {
    setOnLine(undefined);
    expect(isOffline()).toBe(false);
  });
});

describe("isOfflineError", () => {
  it("treats any failure as offline when the browser is offline", () => {
    setOnLine(false);
    expect(isOfflineError(new Error("something else entirely"))).toBe(true);
  });

  it("recognizes a browser fetch rejection while nominally online", () => {
    setOnLine(true);
    expect(isOfflineError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("recognizes the Supabase auth retry wrapper", () => {
    setOnLine(true);
    const error = new Error("Network request failed");
    error.name = "AuthRetryableFetchError";
    expect(isOfflineError(error)).toBe(true);
  });

  it("recognizes Safari's wording", () => {
    setOnLine(true);
    expect(isOfflineError(new TypeError("Load failed"))).toBe(true);
  });

  it("matches on Postgres error details as well as the message", () => {
    setOnLine(true);
    expect(isOfflineError({ message: "", details: "NetworkError on send" })).toBe(true);
  });

  it("does not claim a permission denial is a connection problem", () => {
    setOnLine(true);
    expect(isOfflineError({ code: "42501", message: "permission denied" })).toBe(false);
  });

  it("does not claim an HTTP failure is a connection problem", () => {
    setOnLine(true);
    expect(isOfflineError(new Error("Request failed with 500"))).toBe(false);
  });

  it("does not treat a coding TypeError with a status as offline", () => {
    setOnLine(true);
    const error = new TypeError("x is not a function");
    error.status = 500;
    expect(isOfflineError(error)).toBe(false);
  });

  it("still recognizes our own rethrown wrapper when the browser claims to be online", () => {
    // A captive portal or a dead wifi link reports onLine: true, so the wrapper
    // is the only remaining signal that the request never left the device.
    setOnLine(true);
    const error = new Error(OFFLINE_MESSAGE);
    error.name = "OfflineError";
    expect(isOfflineError(error)).toBe(true);
  });

  it("handles a missing error", () => {
    setOnLine(false);
    expect(isOfflineError(null)).toBe(false);
    expect(isOfflineError(undefined)).toBe(false);
  });
});

describe("describeNetworkError", () => {
  it("explains the connection instead of blaming the service", () => {
    setOnLine(true);
    expect(
      describeNetworkError(new TypeError("Failed to fetch"), "Movie service is unavailable.")
    ).toBe(OFFLINE_MESSAGE);
  });

  it("keeps the caller's copy for a genuine service failure", () => {
    setOnLine(true);
    expect(
      describeNetworkError(new Error("Request failed with 503"), "Movie service is unavailable.")
    ).toBe("Movie service is unavailable.");
  });
});
