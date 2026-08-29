import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runDailyFilterMetadataRefresh: vi.fn(),
  getSupabaseAdmin: vi.fn(() => ({ name: "admin" })),
}));

vi.mock("../_lib/filterMetadataRefresh.js", () => ({
  runDailyFilterMetadataRefresh: mocks.runDailyFilterMetadataRefresh,
}));
vi.mock("../_lib/supabaseAdmin.js", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

import handler from "../cron/refresh-filter-metadata.js";

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("api/cron/refresh-filter-metadata", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "daily-secret";
    delete process.env.FILTER_METADATA_DAILY_MAX_TITLES;
    mocks.runDailyFilterMetadataRefresh.mockReset();
    mocks.runDailyFilterMetadataRefresh.mockResolvedValue({
      claimed: 2,
      succeeded: 2,
      failed: 0,
      exhausted: true,
      elapsedMs: 20,
    });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.FILTER_METADATA_DAILY_MAX_TITLES;
    vi.restoreAllMocks();
  });

  it("rejects unsupported methods and unauthorized calls", async () => {
    const methodRes = createRes();
    await handler({ method: "POST", headers: {} }, methodRes);
    expect(methodRes.statusCode).toBe(405);

    const authRes = createRes();
    await handler({ method: "GET", headers: { authorization: "Bearer wrong" } }, authRes);
    expect(authRes.statusCode).toBe(401);
    expect(mocks.runDailyFilterMetadataRefresh).not.toHaveBeenCalled();
  });

  it("requires cron configuration", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.CRON_SECRET;
    const res = createRes();

    await handler({ method: "GET", headers: {} }, res);

    expect(res.statusCode).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("runs the bounded daily worker with Vercel's bearer token", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    process.env.FILTER_METADATA_DAILY_MAX_TITLES = "90";
    const res = createRes();

    await handler({
      method: "GET",
      headers: { authorization: "Bearer daily-secret" },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ claimed: 2, succeeded: 2 });
    expect(mocks.runDailyFilterMetadataRefresh).toHaveBeenCalledWith(
      { name: "admin" },
      { maxTitles: 90 }
    );
    expect(infoSpy).toHaveBeenCalled();
  });
});
