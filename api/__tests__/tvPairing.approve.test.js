import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  updateResult: { data: null, error: null },
  inspectResult: { data: null, error: null },
}));

function createBuilder(mode) {
  const builder = {
    update: vi.fn(() => createBuilder("update")),
    select: vi.fn(() => (mode === "update" ? builder : createBuilder("select"))),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    maybeSingle: vi.fn(async () =>
      mode === "update" ? mocks.updateResult : mocks.inspectResult
    ),
  };
  return builder;
}

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser: mocks.getUser },
    from: () => createBuilder("root"),
    rpc: mocks.rpc,
  }),
}));

import handler from "../tv-pairing/approve.js";

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

function createReq({ code = "ABCD-2345", token = "access-token" } = {}) {
  return {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: { code },
  };
}

describe("api/tv-pairing/approve", () => {
  beforeEach(() => {
    process.env.TV_PAIRING_RATE_LIMIT_SECRET = "test-rate-limit-secret-at-least-32-characters";
    mocks.getUser.mockReset().mockResolvedValue({
      data: { user: { id: "user-1", email: "viewer@example.com" } },
      error: null,
    });
    mocks.rpc.mockReset().mockResolvedValue({
      data: { allowed: true, retry_after_seconds: 0 },
      error: null,
    });
    mocks.updateResult = {
      data: { id: "device-1", expires_at: "2026-08-17T22:00:00.000Z" },
      error: null,
    };
    mocks.inspectResult = { data: null, error: null };
  });

  afterEach(() => {
    delete process.env.TV_PAIRING_RATE_LIMIT_SECRET;
  });

  it("requires a signed-in approving user", async () => {
    const res = createRes();

    await handler(createReq({ token: null }), res);

    expect(res.statusCode).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("approves a valid code for the authenticated account", async () => {
    const res = createRes();

    await handler(createReq(), res);

    expect(mocks.getUser).toHaveBeenCalledWith("access-token");
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      user: { email: "viewer@example.com" },
    });
  });

  it("rejects malformed codes before authenticating", async () => {
    const res = createRes();

    await handler(createReq({ code: "123" }), res);

    expect(res.statusCode).toBe(400);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("refuses an IP over its limit before authenticating", async () => {
    mocks.rpc.mockResolvedValue({
      data: { allowed: false, retry_after_seconds: 240 },
      error: null,
    });
    const res = createRes();

    await handler(createReq(), res);

    expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toBe("240");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("refuses an authenticated user over their approval limit", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: { allowed: true, retry_after_seconds: 0 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { allowed: false, retry_after_seconds: 180 },
        error: null,
      });
    const res = createRes();

    await handler(createReq(), res);

    expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toBe("180");
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({
      p_bucket: "approve_user",
      p_limit: 12,
      p_window_seconds: 600,
    });
  });

  it("does not distinguish missing, expired, or previously used codes", async () => {
    mocks.updateResult = { data: null, error: null };
    const states = [
      null,
      {
        approved_by: null,
        claimed_at: null,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
      {
        approved_by: "other-user",
        claimed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    ];
    const results = [];

    for (const state of states) {
      mocks.inspectResult = { data: state, error: null };
      const res = createRes();
      await handler(createReq(), res);
      results.push({ statusCode: res.statusCode, body: res.body });
    }

    expect(results).toEqual([
      {
        statusCode: 400,
        body: { error: "That TV code is unavailable. Request a new code on the TV." },
      },
      {
        statusCode: 400,
        body: { error: "That TV code is unavailable. Request a new code on the TV." },
      },
      {
        statusCode: 400,
        body: { error: "That TV code is unavailable. Request a new code on the TV." },
      },
    ]);
  });
});
