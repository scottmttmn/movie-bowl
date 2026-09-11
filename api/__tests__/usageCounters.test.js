import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const getSupabaseAdminMock = vi.fn(() => ({ rpc: rpcMock }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import {
  getEmailDailyWarnThreshold,
  recordEmailUsage,
  recordServiceUsage,
} from "../_lib/usageCounters.js";

describe("recordServiceUsage", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getSupabaseAdminMock.mockClear();
    getSupabaseAdminMock.mockReturnValue({ rpc: rpcMock });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("records the spend and returns the day's running count", async () => {
    rpcMock.mockResolvedValue({ data: 7, error: null });

    await expect(recordServiceUsage("tmdb_request", 4)).resolves.toBe(7);
    expect(rpcMock).toHaveBeenCalledWith("record_service_usage", {
      p_metric: "tmdb_request",
      p_count: 4,
    });
  });

  it("uses an injected client instead of building one", async () => {
    const injectedRpc = vi.fn().mockResolvedValue({ data: 2, error: null });

    await expect(
      recordServiceUsage("tmdb_request", 1, { client: { rpc: injectedRpc } })
    ).resolves.toBe(2);
    expect(injectedRpc).toHaveBeenCalled();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("bounds the wait when the client exposes abortSignal", async () => {
    const abortSignal = vi.fn().mockResolvedValue({ data: 1, error: null });
    const injectedRpc = vi.fn(() => ({ abortSignal }));

    await expect(
      recordServiceUsage("invite_email", 1, { client: { rpc: injectedRpc } })
    ).resolves.toBe(1);
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("ignores a spend of zero rather than recording one", async () => {
    await expect(recordServiceUsage("tmdb_request", 0)).resolves.toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns null and stays quiet about the caller when the database errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: null, error: { message: "nope" } });

    await expect(recordServiceUsage("tmdb_request", 1)).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it("never throws when the client itself is unavailable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getSupabaseAdminMock.mockImplementation(() => {
      throw new Error("Missing Supabase configuration");
    });

    await expect(recordServiceUsage("tmdb_request", 1)).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("recordEmailUsage", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getSupabaseAdminMock.mockClear();
    getSupabaseAdminMock.mockReturnValue({ rpc: rpcMock });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("stays quiet while the day is well under the threshold", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: 3, error: null });

    await expect(recordEmailUsage(1)).resolves.toBe(3);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("warns once the day reaches the threshold", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: 80, error: null });

    await expect(recordEmailUsage(1)).resolves.toBe(80);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("80"));
  });

  it("honours a configured threshold", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("EMAIL_DAILY_WARN_THRESHOLD", "5");
    rpcMock.mockResolvedValue({ data: 5, error: null });

    await expect(recordEmailUsage(1)).resolves.toBe(5);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("threshold of 5"));
  });

  it("falls back to the default threshold for an unusable configured value", () => {
    vi.stubEnv("EMAIL_DAILY_WARN_THRESHOLD", "not-a-number");
    expect(getEmailDailyWarnThreshold()).toBe(80);

    vi.stubEnv("EMAIL_DAILY_WARN_THRESHOLD", "0");
    expect(getEmailDailyWarnThreshold()).toBe(80);
  });
});
