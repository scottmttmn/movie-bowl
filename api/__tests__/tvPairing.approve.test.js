import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
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
  }),
}));

import handler from "../tv-pairing/approve.js";

function createRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
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
    mocks.getUser.mockReset().mockResolvedValue({
      data: { user: { id: "user-1", email: "viewer@example.com" } },
      error: null,
    });
    mocks.updateResult = {
      data: { id: "device-1", expires_at: "2026-08-17T22:00:00.000Z" },
      error: null,
    };
    mocks.inspectResult = { data: null, error: null };
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
});
