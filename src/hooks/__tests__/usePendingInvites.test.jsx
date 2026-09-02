import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: {
    rows: [],
    releaseQuery: null,
    sessionError: null,
    queryError: null,
    deleteError: null,
  },
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { email: "user@example.com" } } },
        error: mocks.state.sessionError,
      })),
    },
    rpc: vi.fn(async () => ({ data: [], error: null })),
    from: () => {
      const query = {
        select: () => query,
        is: () => query,
        in: () => query,
        ilike: () => query,
        delete: () => query,
        eq: () => query,
        order: () => new Promise((resolve) => {
          const settle = () => resolve(
            mocks.state.queryError
              ? { data: null, error: mocks.state.queryError }
              : { data: mocks.state.rows, error: null }
          );
          // Held open when a test wants to act while a read is in flight.
          if (mocks.state.holdQuery) mocks.state.releaseQuery = settle;
          else settle();
        }),
        then: (resolve) => Promise.resolve({ data: null, error: mocks.state.deleteError }).then(resolve),
      };
      return query;
    },
  },
}));

vi.mock("../../lib/bowlInvites", () => ({
  acceptBowlInvite: vi.fn(async () => ({ ok: true, bowlId: "bowl-1" })),
}));

import usePendingInvites, { PendingInvitesProvider } from "../usePendingInvites";

const ROW = {
  id: "inv-1",
  bowl_id: "bowl-1",
  invited_email: "user@example.com",
  invited_by: "owner-1",
  created_at: null,
  token: "tok",
};

function renderProvider() {
  return renderHook(() => usePendingInvites(), { wrapper: PendingInvitesProvider });
}

describe("usePendingInvites", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.assign(mocks.state, {
      rows: [ROW],
      releaseQuery: null,
      holdQuery: false,
      sessionError: null,
      queryError: null,
      deleteError: null,
    });
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("does not let a read that started earlier resurrect an accepted invite", async () => {
    mocks.state.holdQuery = true;
    const { result } = renderProvider();
    await waitFor(() => expect(mocks.state.releaseQuery).toBeTruthy());

    await act(async () => { await result.current.acceptInvite({ id: "inv-1", token: "tok" }); });
    expect(result.current.invites).toHaveLength(0);

    // The in-flight read carries a list from before the acceptance.
    await act(async () => { mocks.state.releaseQuery(); await Promise.resolve(); await Promise.resolve(); });

    expect(result.current.invites).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
  });

  it("does not let a read that started earlier resurrect a declined invite", async () => {
    mocks.state.holdQuery = true;
    const { result } = renderProvider();
    await waitFor(() => expect(mocks.state.releaseQuery).toBeTruthy());

    await act(async () => { await result.current.declineInvite({ id: "inv-1" }); });
    expect(result.current.invites).toHaveLength(0);

    await act(async () => { mocks.state.releaseQuery(); await Promise.resolve(); await Promise.resolve(); });

    expect(result.current.invites).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
  });

  it("keeps the last good inbox when a session read fails", async () => {
    const { result } = renderProvider();
    await waitFor(() => expect(result.current.invites).toHaveLength(1));

    mocks.state.sessionError = { message: "session refresh failed" };
    await act(async () => { await result.current.reloadInvites(); });

    expect(result.current.invites).toHaveLength(1);
    expect(result.current.pendingInviteCount).toBe(1);
    expect(result.current.error).toBe("Could not check for invitations. Try again.");
  });

  it("keeps the last good inbox when the query fails", async () => {
    const { result } = renderProvider();
    await waitFor(() => expect(result.current.invites).toHaveLength(1));

    mocks.state.queryError = { message: "network" };
    await act(async () => { await result.current.reloadInvites(); });

    expect(result.current.invites).toHaveLength(1);
    expect(result.current.error).toBe("Could not check for invitations. Try again.");
  });
});
