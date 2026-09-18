import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    rpcResponse: { data: { restored: 1, skipped: [] }, error: null },
    rows: [],
    rowsError: null,
    rpcArgs: null,
    queryFilters: null,
  };

  return {
    state,
    supabase: {
      rpc: vi.fn(async (name, args) => {
        state.rpcArgs = { name, args };
        return state.rpcResponse;
      }),
      from: vi.fn(() => {
        const filters = {};
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn((column, value) => {
            filters[column] = value;
            return query;
          }),
          order: vi.fn(() => query),
          then: (resolve, reject) => {
            state.queryFilters = filters;
            return Promise.resolve({
              data: state.rowsError ? null : state.rows,
              error: state.rowsError,
            }).then(resolve, reject);
          },
        };
        return query;
      }),
    },
  };
});

vi.mock("../supabase", () => ({ supabase: mocks.supabase }));

import {
  describeSkippedRestores,
  fetchSoloDrawRemovedCopies,
  undoSoloDraw,
} from "../soloDraw";

beforeEach(() => {
  mocks.state.rpcResponse = { data: { restored: 1, skipped: [] }, error: null };
  mocks.state.rows = [];
  mocks.state.rowsError = null;
  mocks.state.rpcArgs = null;
  mocks.state.queryFilters = null;
  mocks.supabase.rpc.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("undoSoloDraw", () => {
  it("reports what the server put back", async () => {
    mocks.state.rpcResponse = {
      data: { restored: 2, skipped: [{ bowl_name: "Friday Bowl", reason: "already_added" }] },
      error: null,
    };

    const result = await undoSoloDraw("event-1");

    expect(mocks.state.rpcArgs).toEqual({
      name: "undo_solo_draw",
      args: { p_event_id: "event-1" },
    });
    expect(result).toMatchObject({ ok: true, restored: 2 });
    expect(result.skipped).toHaveLength(1);
  });

  // The refusals worth repeating are the ones that say something true about
  // this draw: the window has closed, or the entry is not there any more.
  it("shows the server's own refusal and keeps everything else generic", async () => {
    mocks.state.rpcResponse = {
      data: null,
      error: { code: "P0001", message: "This draw can no longer be undone." },
    };

    const refused = await undoSoloDraw("event-1");
    expect(refused).toMatchObject({
      ok: false,
      message: "This draw can no longer be undone.",
      restored: 0,
    });

    mocks.state.rpcResponse = {
      data: null,
      error: { code: "57014", message: "canceling statement due to statement timeout" },
    };

    const failed = await undoSoloDraw("event-1");
    expect(failed).toMatchObject({
      ok: false,
      message: "Could not undo this draw. Please try again.",
    });
  });

  it("refuses to call the server without an entry", async () => {
    const result = await undoSoloDraw(null);

    expect(result.ok).toBe(false);
    expect(mocks.supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("fetchSoloDrawRemovedCopies", () => {
  it("reads the copies one draw removed", async () => {
    mocks.state.rows = [
      { bowl_movie_id: "copy-1", bowl_id: "bowl-1", bowl_name: "First Bowl", title: "Arrival" },
    ];

    const copies = await fetchSoloDrawRemovedCopies("event-1");

    expect(mocks.state.queryFilters).toEqual({ watch_event_id: "event-1" });
    expect(copies).toEqual([
      { id: "copy-1", bowlId: "bowl-1", bowlName: "First Bowl", title: "Arrival" },
    ]);
  });

  // The draw has already committed by the time this runs, so a failed read may
  // not turn into a failed draw.
  it("says nothing about removals when the read fails", async () => {
    mocks.state.rowsError = { message: "boom" };

    expect(await fetchSoloDrawRemovedCopies("event-1")).toEqual([]);
  });
});

describe("describeSkippedRestores", () => {
  it("says nothing when everything went back", () => {
    expect(describeSkippedRestores([])).toBe("");
    expect(describeSkippedRestores(null)).toBe("");
  });

  it("names the bowls a copy could not go back to", () => {
    expect(describeSkippedRestores([{ bowl_name: "First Bowl", reason: "bowl_gone" }])).toBe(
      "The copy in First Bowl could not go back, so it stays removed."
    );

    expect(
      describeSkippedRestores([
        { bowl_name: "First Bowl", reason: "bowl_gone" },
        { bowl_name: "Second Bowl", reason: "no_access" },
      ])
    ).toBe("2 copies could not go back, in First Bowl and Second Bowl. They stay removed.");
  });

  it("keeps the line short when many bowls are involved", () => {
    const skipped = ["A Bowl", "B Bowl", "C Bowl", "D Bowl"].map((bowl_name) => ({
      bowl_name,
      reason: "no_access",
    }));

    expect(describeSkippedRestores(skipped)).toBe(
      "4 copies could not go back, in A Bowl, B Bowl and 2 more. They stay removed."
    );
  });
});
