import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      signOut: mocks.signOut,
    },
  },
}));

import { deleteMyAccount } from "../account";

describe("deleteMyAccount", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    mocks.getSession.mockReset();
    mocks.signOut.mockReset();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
      error: null,
    });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("returns owned bowl blockers without clearing the local session", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        code: "owned_bowls",
        error: "Transfer or delete bowls first.",
        bowls: [{ id: "bowl-1", name: "Friday Night" }],
      }),
    });

    await expect(deleteMyAccount()).resolves.toEqual({
      ok: false,
      code: "owned_bowls",
      error: "Transfer or delete bowls first.",
      bowls: [{ id: "bowl-1", name: "Friday Night" }],
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("clears the local session after permanent deletion", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ deleted: true }),
    });

    await expect(deleteMyAccount()).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledWith("/api/account/delete", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
    }));
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
