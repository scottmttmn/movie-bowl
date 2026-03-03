import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("api/invites/send", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    process.env.RESEND_API_KEY = "resend-key";
    process.env.INVITE_EMAIL_FROM = "Movie Bowl <invites@mail.moviebowl.app>";
    process.env.APP_BASE_URL = "https://moviebowl.app";
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

  it("rejects malformed payloads", async () => {
    const res = createRes();

    await handler({ method: "POST", body: {} }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Missing invites payload." });
  });

  it("sends invite emails through Resend and returns per-recipient results", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-1" }),
    });

    const res = createRes();

    await handler(
      {
        method: "POST",
        body: {
          invites: [
            {
              bowlId: "bowl-1",
              bowlName: "Weekend Bowl",
              invitedEmail: "friend@example.com",
              invitedByEmail: "owner@example.com",
              token: "token-1",
            },
          ],
        },
      },
      res
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer resend-key",
        }),
      })
    );
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

    await handler(
      {
        method: "POST",
        body: {
          invites: [
            {
              bowlId: "bowl-1",
              bowlName: "Weekend Bowl",
              invitedEmail: "friend@example.com",
              token: "token-1",
            },
          ],
        },
      },
      res
    );

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

    await handler(
      {
        method: "POST",
        body: {
          invites: [
            {
              bowlId: "bowl-1",
              bowlName: "Weekend Bowl",
              invitedEmail: "friend@example.com",
              token: "token-1",
            },
          ],
        },
      },
      res
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Missing invite email configuration." });
  });
});

