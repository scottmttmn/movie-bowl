import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const inMock = vi.fn();
const selectMock = vi.fn(() => ({ in: inMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getSupabaseAdmin: () => ({
    auth: {
      getUser: getUserMock,
    },
    from: fromMock,
  }),
}));

import handler from "../invites/send.js";

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

function createRequest(body, accessToken = "access-token") {
  return {
    method: "POST",
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
    body,
  };
}

function createStoredInvite(overrides = {}) {
  return {
    token: "token-1",
    bowl_id: "bowl-1",
    invited_email: "friend@example.com",
    invited_by: "user-1",
    accepted_at: null,
    bowls: {
      name: "Weekend <Bowl>",
      owner_id: "user-1",
    },
    ...overrides,
  };
}

describe("api/invites/send", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    process.env.RESEND_API_KEY = "resend-key";
    process.env.INVITE_EMAIL_FROM = "Movie Bowl <invites@mail.moviebowl.app>";
    process.env.APP_BASE_URL = "https://moviebowl.app";
    getUserMock.mockReset();
    inMock.mockReset();
    selectMock.mockClear();
    fromMock.mockClear();
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "owner@example.com",
        },
      },
      error: null,
    });
    inMock.mockResolvedValue({
      data: [createStoredInvite()],
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.INVITE_EMAIL_FROM;
    delete process.env.APP_BASE_URL;
  });

  it("rejects non-POST requests", async () => {
    const res = createRes();

    await handler({ method: "GET" }, res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: "Method not allowed" });
  });

  it("requires an authenticated user", async () => {
    const res = createRes();

    await handler(createRequest({ invites: [{ token: "token-1" }] }, null), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Authentication required." });
    expect(getUserMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests before checking email configuration", async () => {
    delete process.env.RESEND_API_KEY;
    const res = createRes();

    await handler(createRequest({ invites: [{ token: "token-1" }] }, null), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Authentication required." });
    expect(getUserMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads", async () => {
    const res = createRes();

    await handler(createRequest({}), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Missing invites payload." });
  });

  it("rejects oversized batches before querying or sending", async () => {
    const res = createRes();
    const invites = Array.from({ length: 26 }, (_, index) => ({ token: `token-${index}` }));

    await handler(createRequest({ invites }), res);

    expect(res.statusCode).toBe(413);
    expect(res.body).toEqual({ error: "A maximum of 25 invites can be sent at once." });
    expect(getUserMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid access tokens", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT" },
    });
    const res = createRes();

    await handler(createRequest({ invites: [{ token: "token-1" }] }), res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Authentication required." });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects invites not owned by the authenticated bowl owner", async () => {
    inMock.mockResolvedValue({
      data: [createStoredInvite({ invited_by: "different-user" })],
      error: null,
    });
    const res = createRes();

    await handler(createRequest({ invites: [{ token: "token-1" }] }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "One or more invites are not available to send." });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects accepted invites", async () => {
    inMock.mockResolvedValue({
      data: [createStoredInvite({ accepted_at: "2026-07-26T12:00:00.000Z" })],
      error: null,
    });
    const res = createRes();

    await handler(createRequest({ invites: [{ token: "token-1" }] }), res);

    expect(res.statusCode).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uses verified database values and escapes email HTML", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-1" }),
    });

    const res = createRes();

    await handler(
      createRequest({
        invites: [
          {
            bowlId: "forged-bowl",
            bowlName: "<img src=x onerror=alert(1)>",
            invitedEmail: "victim@example.com",
            invitedByEmail: "attacker@example.com",
            token: "token-1",
          },
        ],
      }),
      res
    );

    expect(getUserMock).toHaveBeenCalledWith("access-token");
    expect(fromMock).toHaveBeenCalledWith("bowl_invites");
    expect(inMock).toHaveBeenCalledWith("token", ["token-1"]);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer resend-key",
        }),
      })
    );

    const resendRequest = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(resendRequest.to).toEqual(["friend@example.com"]);
    expect(resendRequest.html).toContain("owner@example.com");
    expect(resendRequest.html).toContain("Weekend &lt;Bowl&gt;");
    expect(resendRequest.html).not.toContain("<img");
    expect(resendRequest.html).not.toContain("victim@example.com");
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      sent: 1,
      failed: 0,
      results: [{ email: "friend@example.com", ok: true }],
    });
  });

  it("returns failed results when Resend returns an error", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: "smtp down" }),
    });

    const res = createRes();

    await handler(createRequest({ invites: [{ token: "token-1" }] }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      sent: 0,
      failed: 1,
      results: [
        {
          email: "friend@example.com",
          ok: false,
          error: "smtp down",
        },
      ],
    });
  });

  it("returns configuration error when required env vars are missing", async () => {
    delete process.env.RESEND_API_KEY;

    const res = createRes();

    await handler(createRequest({ invites: [{ token: "token-1" }] }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Missing invite email configuration." });
  });
});
