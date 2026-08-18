import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashDeviceSecret } from "../_lib/tvPairing.js";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  cleanup: vi.fn(),
  from: vi.fn(),
}));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
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
    mocks.insert.mockReset().mockResolvedValue({ error: null });
    mocks.cleanup.mockReset().mockResolvedValue({ error: null });
    mocks.from.mockReset().mockImplementation(() => ({
      insert: mocks.insert,
      delete: () => ({ lt: mocks.cleanup }),
    }));
  });

  afterEach(() => {
    delete process.env.APP_BASE_URL;
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
  });
});
