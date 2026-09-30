import { describe, expect, it, vi } from "vitest";
import { fetchSearchMarkSources } from "../searchMarkSources";

function fakeClient(tables) {
  const calls = [];
  const client = {
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      const query = {
        select: (columns) => { call.columns = columns; return query; },
        in: (column, values) => { call.filters.push(["in", column, values]); return query; },
        is: (column, value) => { call.filters.push(["is", column, value]); return query; },
        eq: (column, value) => { call.filters.push(["eq", column, value]); return query; },
        gt: (column, value) => { call.filters.push(["gt", column, value]); return query; },
        order: () => query,
        range: async () => tables[table],
      };
      return query;
    },
  };
  return { client, calls };
}

describe("fetchSearchMarkSources", () => {
  it("reads undrawn slips in your bowls and only your own watch history", async () => {
    const { client, calls } = fakeClient({
      bowl_movies: { data: [{ id: "s1", bowl_id: "a", tmdb_id: 10 }], error: null },
      user_watch_events: { data: [{ id: "w1", tmdb_id: 11, watched_on: "2026-01-05" }], error: null },
    });

    const result = await fetchSearchMarkSources({ userId: "me", bowlIds: ["a", "b"], client });

    expect(result).toEqual({
      slips: [{ id: "s1", bowl_id: "a", tmdb_id: 10 }],
      watchEvents: [{ id: "w1", tmdb_id: 11, watched_on: "2026-01-05" }],
    });
    const slips = calls.find((call) => call.table === "bowl_movies");
    expect(slips.filters).toEqual(expect.arrayContaining([["in", "bowl_id", ["a", "b"]], ["is", "drawn_at", null], ["gt", "tmdb_id", 0]]));
    const history = calls.find((call) => call.table === "user_watch_events");
    expect(history.filters).toEqual(expect.arrayContaining([["eq", "user_id", "me"], ["gt", "tmdb_id", 0]]));
  });

  it("fails the whole read when either half fails", async () => {
    const { client } = fakeClient({
      bowl_movies: { data: [], error: null },
      user_watch_events: { data: null, error: new Error("denied") },
    });

    await expect(fetchSearchMarkSources({ userId: "me", bowlIds: ["a"], client })).rejects.toThrow("denied");
  });

  it("reads nothing without an account or a bowl", async () => {
    const client = { from: vi.fn() };

    await expect(fetchSearchMarkSources({ userId: null, bowlIds: ["a"], client })).resolves.toEqual({ slips: [], watchEvents: [] });
    await expect(fetchSearchMarkSources({ userId: "me", bowlIds: [], client })).resolves.toEqual({ slips: [], watchEvents: [] });
    expect(client.from).not.toHaveBeenCalled();
  });
});
