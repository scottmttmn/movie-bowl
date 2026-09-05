import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashDeviceSecret } from "../_lib/tvPairing.js";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  cleanup: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

import handler from "../tv-pairing/start.js";

function createRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
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

describe("api/tv-pairing/start", () => {
  beforeEach(() => {
    process.env.APP_BASE_URL = "https://moviebowl.app";
    process.env.TV_PAIRING_RATE_LIMIT_SECRET = "test-rate-limit-secret-at-least-32-characters";
    mocks.insert.mockReset().mockResolvedValue({ error: null });
    mocks.cleanup.mockReset().mockResolvedValue({ error: null });
    mocks.rpc.mockReset().mockResolvedValue({
      data: { allowed: true, retry_after_seconds: 0 },
      error: null,
    });
    mocks.from.mockReset().mockImplementation(() => ({
      insert: mocks.insert,
      delete: () => ({ lt: mocks.cleanup }),
    }));
  });

  afterEach(() => {
    delete process.env.APP_BASE_URL;
    delete process.env.TV_PAIRING_RATE_LIMIT_SECRET;
    vi.restoreAllMocks();
  });

  it("creates a short-lived request while storing only the device-secret hash", async () => {
    const res = createRes();

    await handler({ method: "POST", headers: {} }, res);

    expect(res.statusCode).toBe(201);
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(res.body.userCode).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(res.body.deviceSecret).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(res.body.verificationUriComplete).toBe(
      `https://moviebowl.app/activate-tv?code=${res.body.userCode}`
    );

    const inserted = mocks.insert.mock.calls[0][0];
    expect(inserted).not.toHaveProperty("device_secret");
    expect(inserted.device_secret_hash).toBe(hashDeviceSecret(res.body.deviceSecret));
    expect(new Date(inserted.expires_at).getTime() - Date.now()).toBeGreaterThan(9 * 60 * 1000);
  });

  it("rejects non-POST requests without touching the database", async () => {
    const res = createRes();

    await handler({ method: "GET" }, res);

    expect(res.statusCode).toBe(405);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses excess starts before creating another pairing request", async () => {
    mocks.rpc.mockResolvedValue({
      data: { allowed: false, retry_after_seconds: 321 },
      error: null,
    });
    const res = createRes();

    await handler(
      { method: "POST", headers: { "x-vercel-forwarded-for": "203.0.113.12" } },
      res
    );

    expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toBe("321");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
    const rateLimitArgs = mocks.rpc.mock.calls[0][1];
    expect(rateLimitArgs).toMatchObject({
      p_bucket: "start_ip",
      p_limit: 12,
      p_window_seconds: 600,
    });
    expect(rateLimitArgs.p_subject_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(rateLimitArgs)).not.toContain("203.0.113.12");
  });
});
