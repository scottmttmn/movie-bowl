import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUserById: vi.fn(),
  generateLink: vi.fn(),
}));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getSupabaseAdmin: () => ({
    auth: {
      admin: {
        getUserById: mocks.getUserById,
        generateLink: mocks.generateLink,
      },
    },
    from: mocks.from,
  }),
}));

import handler from "../tv-pairing/poll.js";

const DEVICE_ID = "40000000-0000-4000-8000-000000000001";
const DEVICE_SECRET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO_123";

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

function createReq(overrides = {}) {
  return {
    method: "POST",
    headers: {},
    body: {
      deviceId: DEVICE_ID,
      deviceSecret: DEVICE_SECRET,
      ...overrides,
    },
  };
}

function createSelectBuilder(result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
  };
  return builder;
}

function createClaimBuilder(result) {
  const builder = {
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    select: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
  };
  return builder;
}

describe("api/tv-pairing/poll", () => {
  beforeEach(() => {
    process.env.APP_BASE_URL = "https://moviebowl.app";
    mocks.from.mockReset();
    mocks.getUserById.mockReset().mockResolvedValue({
      data: { user: { id: "user-1", email: "viewer@example.com" } },
      error: null,
    });
    mocks.generateLink.mockReset().mockResolvedValue({
      data: {
        properties: {
          hashed_token: "single-use-hashed-token",
          action_link: "https://project.supabase.co/auth/v1/verify?secret=do-not-return",
        },
      },
      error: null,
    });
  });

  afterEach(() => {
    delete process.env.APP_BASE_URL;
  });

  it("keeps an unapproved television waiting", async () => {
    mocks.from.mockReturnValueOnce(
      createSelectBuilder({
        data: {
          id: DEVICE_ID,
          approved_by: null,
          approved_at: null,
          claimed_at: null,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        error: null,
      })
    );
    const res = createRes();

    await handler(createReq(), res);

    expect(res.statusCode).toBe(202);
    expect(res.body.status).toBe("pending");
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });

  it("returns only a single-use token hash after approval", async () => {
    mocks.from
      .mockReturnValueOnce(
        createSelectBuilder({
          data: {
            id: DEVICE_ID,
            approved_by: "user-1",
            approved_at: new Date().toISOString(),
            claimed_at: null,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          },
          error: null,
        })
      )
      .mockReturnValueOnce(
        createClaimBuilder({ data: { approved_by: "user-1" }, error: null })
      );
    const res = createRes();

    await handler(createReq(), res);

    expect(mocks.getUserById).toHaveBeenCalledWith("user-1");
    expect(mocks.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "viewer@example.com",
      options: { redirectTo: "https://moviebowl.app/tv" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      status: "approved",
      tokenHash: "single-use-hashed-token",
      verificationType: "magiclink",
    });
    expect(JSON.stringify(res.body)).not.toContain("action_link");
    expect(JSON.stringify(res.body)).not.toContain("viewer@example.com");
  });

  it("does not disclose whether a valid device id exists when its secret is wrong", async () => {
    mocks.from.mockReturnValueOnce(
      createSelectBuilder({ data: null, error: null })
    );
    const res = createRes();

    await handler(createReq({ deviceSecret: "wrong-secret-that-is-still-long-enough-123456789" }), res);

    expect(res.statusCode).toBe(404);
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });
});
