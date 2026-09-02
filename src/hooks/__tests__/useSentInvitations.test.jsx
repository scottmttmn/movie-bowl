import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: {
    rows: [],
    loadError: null,
    createResult: { data: { invitations: [] }, error: null },
    revokeResult: { data: "revoked", error: null },
    emailResult: { sent: 1, failed: 0, results: [], error: null },
    createCalls: [],
  },
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        is: () => query,
        in: () => query,
        order: async () => (mocks.state.loadError
          ? { data: null, error: mocks.state.loadError }
          : { data: mocks.state.rows, error: null }),
      };
      return query;
    },
  },
}));

vi.mock("../../lib/bowlInvites", () => ({
  createBowlInvitations: vi.fn(async (args) => {
    mocks.state.createCalls.push(args);
    return mocks.state.createResult;
  }),
  revokeBowlInvitation: vi.fn(async () => mocks.state.revokeResult),
}));

vi.mock("../../lib/inviteEmails", () => ({
  sendInviteEmails: vi.fn(async () => mocks.state.emailResult),
}));

import useSentInvitations from "../useSentInvitations";

const OWNED = [{ id: "bowl-1", name: "Friday Night", role: "Owner" }];

async function renderSent(owned = OWNED) {
  const view = renderHook(({ bowls }) => useSentInvitations(bowls), {
    initialProps: { bowls: owned },
  });
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

describe("useSentInvitations", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.assign(mocks.state, {
      rows: [{ id: "s1", bowl_id: "bowl-1", invited_email: "friend@example.com", token: "tok", created_at: null }],
      loadError: null,
      createResult: { data: { invitations: [] }, error: null },
      revokeResult: { data: "revoked", error: null },
      emailResult: { sent: 1, failed: 0, results: [], error: null },
      createCalls: [],
    });
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("loads pending invitations for owned bowls", async () => {
    const { result } = await renderSent();
    expect(result.current.invitations).toHaveLength(1);
    expect(result.current.loadError).toBeNull();
  });

  it("skips the query and reports nothing when no bowls are owned", async () => {
    const { result } = await renderSent([]);
    expect(result.current.invitations).toEqual([]);
    expect(result.current.loadError).toBeNull();
  });

  it("keeps the last good list when a refresh fails", async () => {
    const { result } = await renderSent();
    mocks.state.loadError = { message: "network" };

    await act(async () => { await result.current.refresh(); });

    expect(result.current.loadError).toBe("Could not load the invitations you sent. Try again.");
    expect(result.current.invitations).toHaveLength(1);
  });

  it("emails only the invitations the database actually created", async () => {
    mocks.state.createResult = {
      data: {
        invitations: [
          { invited_email: "new@example.com", status: "created", token: "tok-new" },
          { invited_email: "member@example.com", status: "already_member", token: null },
        ],
      },
      error: null,
    };
    const { sendInviteEmails } = await import("../../lib/inviteEmails");
    const { result } = await renderSent();

    let outcome;
    await act(async () => {
      outcome = await result.current.send({
        bowlId: "bowl-1",
        bowlName: "Friday Night",
        emails: ["new@example.com", "member@example.com"],
        senderEmail: "owner@example.com",
      });
    });

    expect(outcome).toEqual({ ok: true, message: "Sent 1 invitation to Friday Night." });
    expect(sendInviteEmails).toHaveBeenCalledWith([
      expect.objectContaining({ invitedEmail: "new@example.com", token: "tok-new" }),
    ]);
  });

  it("reports created rows even when their emails fail", async () => {
    mocks.state.createResult = {
      data: { invitations: [{ invited_email: "new@example.com", status: "created", token: "tok-new" }] },
      error: null,
    };
    mocks.state.emailResult = { sent: 0, failed: 1, results: [], error: "smtp down" };
    const { result } = await renderSent();

    let outcome;
    await act(async () => {
      outcome = await result.current.send({ bowlId: "bowl-1", bowlName: "Friday Night", emails: ["new@example.com"] });
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.message).toMatch(/1 invitation created, but 1 email could not be sent/i);
  });

  it("says nothing was needed when every address was already covered", async () => {
    mocks.state.createResult = {
      data: {
        invitations: [
          { invited_email: "a@example.com", status: "already_pending", token: "t" },
          { invited_email: "b@example.com", status: "already_member", token: null },
        ],
      },
      error: null,
    };
    const { sendInviteEmails } = await import("../../lib/inviteEmails");
    const { result } = await renderSent();

    let outcome;
    await act(async () => {
      outcome = await result.current.send({ bowlId: "bowl-1", bowlName: "Friday Night", emails: ["a@example.com", "b@example.com"] });
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.message).toMatch(/no new invitations were needed/i);
    expect(sendInviteEmails).not.toHaveBeenCalled();
  });

  it("replays one request id until the batch is known to have landed", async () => {
    mocks.state.createResult = { data: null, error: { message: "timeout" } };
    const { result } = await renderSent();

    await act(async () => {
      await result.current.send({ bowlId: "bowl-1", bowlName: "Friday Night", emails: ["new@example.com"] });
    });
    mocks.state.createResult = {
      data: { invitations: [{ invited_email: "new@example.com", status: "created", token: "tok-new" }] },
      error: null,
    };
    await act(async () => {
      await result.current.send({ bowlId: "bowl-1", bowlName: "Friday Night", emails: ["new@example.com"] });
    });

    expect(mocks.state.createCalls).toHaveLength(2);
    expect(mocks.state.createCalls[0].requestId).toBe(mocks.state.createCalls[1].requestId);

    // A settled batch starts a new request id rather than replaying the old one.
    await act(async () => {
      await result.current.send({ bowlId: "bowl-1", bowlName: "Friday Night", emails: ["other@example.com"] });
    });
    expect(mocks.state.createCalls[2].requestId).not.toBe(mocks.state.createCalls[1].requestId);
  });

  it("rotates the request id when a retry carries a different payload", async () => {
    mocks.state.createResult = { data: null, error: { message: "timeout" } };
    const { result } = await renderSent();

    await act(async () => {
      await result.current.send({ bowlId: "bowl-1", bowlName: "Friday Night", emails: ["a@example.com"] });
    });
    // Same addresses, different bowl: the recorded batch would not match, and the
    // RPC rejects a reused id carrying a different payload permanently.
    await act(async () => {
      await result.current.send({ bowlId: "bowl-2", bowlName: "Family", emails: ["a@example.com"] });
    });
    // Same bowl, an address added.
    await act(async () => {
      await result.current.send({ bowlId: "bowl-2", bowlName: "Family", emails: ["a@example.com", "b@example.com"] });
    });

    const ids = mocks.state.createCalls.map((call) => call.requestId);
    expect(new Set(ids).size).toBe(3);
  });

  it("reuses the id for an identical retry regardless of address order", async () => {
    mocks.state.createResult = { data: null, error: { message: "timeout" } };
    const { result } = await renderSent();

    await act(async () => {
      await result.current.send({ bowlId: "bowl-1", bowlName: "Friday Night", emails: ["a@example.com", "b@example.com"] });
    });
    await act(async () => {
      await result.current.send({ bowlId: "bowl-1", bowlName: "Friday Night", emails: ["b@example.com", "a@example.com"] });
    });

    expect(mocks.state.createCalls[0].requestId).toBe(mocks.state.createCalls[1].requestId);
  });

  it("collapses concurrent sends so recipients are emailed once", async () => {
    mocks.state.createResult = {
      data: { invitations: [{ invited_email: "new@example.com", status: "created", token: "tok-new" }] },
      error: null,
    };
    const { sendInviteEmails } = await import("../../lib/inviteEmails");
    const { result } = await renderSent();

    let first;
    let second;
    await act(async () => {
      const input = { bowlId: "bowl-1", bowlName: "Friday Night", emails: ["new@example.com"] };
      first = result.current.send(input);
      second = result.current.send(input);
      await first;
    });

    expect(second).toBe(first);
    expect(mocks.state.createCalls).toHaveLength(1);
    expect(sendInviteEmails).toHaveBeenCalledTimes(1);
  });

  it("drops a revoked row even when the follow-up read fails", async () => {
    const { result } = await renderSent();
    expect(result.current.invitations).toHaveLength(1);
    // The RPC is authoritative about the outcome; the re-read is a courtesy that
    // is allowed to fail without leaving a dead row holding live-looking actions.
    mocks.state.loadError = { message: "network" };

    await act(async () => {
      await result.current.revoke({ bowlId: "bowl-1", invitationId: "s1", invitedEmail: "friend@example.com" });
    });

    expect(result.current.invitations).toHaveLength(0);
    expect(result.current.loadError).toBe("Could not load the invitations you sent. Try again.");
  });

  it("drops a row for any terminal outcome, not just a revoke", async () => {
    for (const outcome of ["already_accepted", "not_pending"]) {
      mocks.state.rows = [{ id: "s1", bowl_id: "bowl-1", invited_email: "friend@example.com", token: "tok", created_at: null }];
      mocks.state.loadError = null;
      mocks.state.revokeResult = { data: outcome, error: null };
      const { result, unmount } = await renderSent();
      mocks.state.loadError = { message: "network" };

      await act(async () => {
        await result.current.revoke({ bowlId: "bowl-1", invitationId: "s1", invitedEmail: "friend@example.com" });
      });

      expect(result.current.invitations, outcome).toHaveLength(0);
      unmount();
    }
  });

  it("keeps the row when the revoke itself failed", async () => {
    mocks.state.revokeResult = { data: null, error: { message: "nope" } };
    const { result } = await renderSent();

    await act(async () => {
      await result.current.revoke({ bowlId: "bowl-1", invitationId: "s1", invitedEmail: "friend@example.com" });
    });

    expect(result.current.invitations).toHaveLength(1);
  });

  it("distinguishes revoked, already accepted, and no longer pending", async () => {
    const { result } = await renderSent();
    const revoke = () => result.current.revoke({ bowlId: "bowl-1", invitationId: "s1", invitedEmail: "friend@example.com" });

    let outcome;
    await act(async () => { outcome = await revoke(); });
    expect(outcome.message).toBe("Invitation revoked for friend@example.com.");

    mocks.state.revokeResult = { data: "already_accepted", error: null };
    await act(async () => { outcome = await revoke(); });
    expect(outcome.message).toMatch(/accepted before the invitation could be revoked/i);

    mocks.state.revokeResult = { data: "not_pending", error: null };
    await act(async () => { outcome = await revoke(); });
    expect(outcome.message).toMatch(/no longer pending/i);

    mocks.state.revokeResult = { data: null, error: { message: "nope" } };
    await act(async () => { outcome = await revoke(); });
    expect(outcome).toEqual({ ok: false, message: "Could not revoke that invitation. Try again." });
  });
});
