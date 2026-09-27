import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    userId: "user-1",
    row: null,
    selectError: null,
    rpcResult: { data: null, error: null },
    filters: {},
    rpcCalls: [],
  };

  return {
    state,
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({
          data: state.userId ? { session: { user: { id: state.userId } } } : {},
          error: null,
        })),
      },
      from: vi.fn((table) => {
        state.filters = { table };
        const query = {
          select: vi.fn((columns) => {
            state.filters.columns = columns;
            return query;
          }),
          eq: vi.fn((column, value) => {
            state.filters[column] = value;
            return query;
          }),
          maybeSingle: vi.fn(async () => ({ data: state.row, error: state.selectError })),
        };
        return query;
      }),
      rpc: vi.fn(async (name, params) => {
        state.rpcCalls.push({ name, params });
        return state.rpcResult;
      }),
    },
  };
});

vi.mock("../supabase", () => ({ supabase: mocks.supabase }));

import { fetchOwnDrawWatchEntry, updateOwnWatchComment } from "../watchComments";

describe("watchComments", () => {
  beforeEach(() => {
    mocks.state.userId = "user-1";
    mocks.state.row = null;
    mocks.state.selectError = null;
    mocks.state.rpcResult = { data: null, error: null };
    mocks.state.filters = {};
    mocks.state.rpcCalls = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("looks up only your own entry for that bowl draw", async () => {
    mocks.state.row = { id: "history-1", personal_note: "Loved it." };

    await expect(fetchOwnDrawWatchEntry("draw-1")).resolves.toEqual({
      id: "history-1",
      personal_note: "Loved it.",
    });
    expect(mocks.state.filters).toMatchObject({
      table: "user_watch_events",
      columns: "id, personal_note",
      user_id: "user-1",
      source_kind: "bowl_draw",
      source_draw_event_id: "draw-1",
    });
  });

  it("answers null when signed out, without an id, or when the read fails", async () => {
    await expect(fetchOwnDrawWatchEntry(null)).resolves.toBeNull();

    mocks.state.userId = null;
    await expect(fetchOwnDrawWatchEntry("draw-1")).resolves.toBeNull();

    mocks.state.userId = "user-1";
    mocks.state.selectError = { message: "boom" };
    await expect(fetchOwnDrawWatchEntry("draw-1")).resolves.toBeNull();
  });

  it("saves a trimmed comment and returns what the server kept", async () => {
    mocks.state.rpcResult = { data: { id: "history-1", personal_note: "Saved." }, error: null };

    await expect(updateOwnWatchComment("history-1", "  Saved.  ")).resolves.toEqual({
      ok: true,
      note: "Saved.",
    });
    expect(mocks.state.rpcCalls).toEqual([
      { name: "update_own_watch_event_note", params: { p_event_id: "history-1", p_note: "Saved." } },
    ]);
  });

  it("reads the saved comment whether the row arrives bare or in an array", async () => {
    mocks.state.rpcResult = { data: [{ id: "history-1", personal_note: "Saved." }], error: null };

    await expect(updateOwnWatchComment("history-1", "Saved.")).resolves.toEqual({
      ok: true,
      note: "Saved.",
    });
  });

  it("clears a blank comment to null", async () => {
    mocks.state.rpcResult = { data: { id: "history-1", personal_note: null }, error: null };

    await expect(updateOwnWatchComment("history-1", "   ")).resolves.toEqual({ ok: true, note: null });
    expect(mocks.state.rpcCalls[0].params.p_note).toBeNull();
  });

  it("refuses an over-limit comment before calling the server", async () => {
    const result = await updateOwnWatchComment("history-1", "x".repeat(501));

    expect(result).toEqual({ ok: false, message: "Comment must be 500 characters or fewer." });
    expect(mocks.state.rpcCalls).toEqual([]);
  });

  it("passes the server's refusal through as the message", async () => {
    mocks.state.rpcResult = {
      data: null,
      error: { message: "This history entry is no longer available." },
    };

    await expect(updateOwnWatchComment("history-1", "Mine")).resolves.toEqual({
      ok: false,
      message: "This history entry is no longer available.",
    });
  });
});
