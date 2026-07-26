import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
  },
}));

import { sendInviteEmails } from "../inviteEmails";

describe("sendInviteEmails", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    getSessionMock.mockReset();
  });

  it("does not call the API without a signed-in session", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const result = await sendInviteEmails([{ invitedEmail: "friend@example.com", token: "token-1" }]);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toEqual({
      sent: 0,
      failed: 1,
      results: [],
      error: "Sign in to send invite emails.",
    });
  });

  it("sends only invite tokens with the current access token", async () => {
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: "access-token",
        },
      },
      error: null,
    });
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        sent: 1,
        failed: 0,
        results: [{ email: "friend@example.com", ok: true }],
      }),
    });

    const result = await sendInviteEmails([
      {
        bowlId: "bowl-1",
        bowlName: "Forged name",
        invitedEmail: "victim@example.com",
        invitedByEmail: "attacker@example.com",
        token: "token-1",
      },
    ]);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/invites/send",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invites: [{ token: "token-1" }] }),
      })
    );
    expect(result).toEqual({
      sent: 1,
      failed: 0,
      results: [{ email: "friend@example.com", ok: true }],
      error: null,
    });
  });
});
