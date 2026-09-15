import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    userId: "user-1",
    authError: null,
    byTmdbId: [],
    byRowId: [],
    bowlRows: [],
    moviesError: null,
    bowlsError: null,
    deleteError: null,
    movieQueries: [],
    deleteFilters: null,
  };

  return {
    state,
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({
          data: state.userId ? { session: { user: { id: state.userId } } } : {},
          error: state.authError,
        })),
      },
      from: vi.fn((table) => {
        const filters = {};
        const query = {
          select: vi.fn(() => query),
          delete: vi.fn(() => {
            filters.delete = true;
            return query;
          }),
          eq: vi.fn((column, value) => {
            filters[column] = value;
            return query;
          }),
          is: vi.fn((column, value) => {
            filters[column] = value;
            return query;
          }),
          in: vi.fn((column, values) => {
            filters[column] = values;
            return query;
          }),
          then: (resolve, reject) => {
            if (table === "bowls") {
              return Promise.resolve({
                data: state.bowlsError ? null : state.bowlRows,
                error: state.bowlsError,
              }).then(resolve, reject);
            }

            if (filters.delete) {
              state.deleteFilters = filters;
              return Promise.resolve({ data: null, error: state.deleteError }).then(
                resolve,
                reject
              );
            }

            state.movieQueries.push(filters);
            const data = filters.tmdb_id ? state.byTmdbId : state.byRowId;
            return Promise.resolve({
              data: state.moviesError ? null : data,
              error: state.moviesError,
            }).then(resolve, reject);
          },
        };
        return query;
      }),
    },
  };
});

vi.mock("../supabase", () => ({ supabase: mocks.supabase }));

import { findOwnUndrawnBowlCopies, removeOwnBowlCopies } from "../ownBowlCopies";

beforeEach(() => {
  Object.assign(mocks.state, {
    userId: "user-1",
    authError: null,
    byTmdbId: [],
    byRowId: [],
    bowlRows: [],
    moviesError: null,
    bowlsError: null,
    deleteError: null,
    movieQueries: [],
    deleteFilters: null,
  });
  mocks.supabase.from.mockClear();
});

describe("findOwnUndrawnBowlCopies", () => {
  it("finds your copies of a title across bowls", async () => {
    mocks.state.byTmdbId = [
      { id: "copy-1", bowl_id: "bowl-1" },
      { id: "copy-2", bowl_id: "bowl-2" },
    ];
    mocks.state.bowlRows = [
      { id: "bowl-1", name: "First Bowl" },
      { id: "bowl-2", name: "Second Bowl" },
    ];

    const matches = await findOwnUndrawnBowlCopies({ tmdbId: 500 });

    expect(matches).toEqual([
      { id: "copy-1", bowlId: "bowl-1", bowlName: "First Bowl" },
      { id: "copy-2", bowlId: "bowl-2", bowlName: "Second Bowl" },
    ]);
    expect(mocks.state.movieQueries[0]).toEqual({
      added_by: "user-1",
      tmdb_id: 500,
      drawn_at: null,
    });
  });

  // The gap a solo draw closes: a custom title's negative synthetic id matches
  // no other row, so without the drawn row there is nothing to offer at all.
  it("finds a custom title by the row that was drawn", async () => {
    mocks.state.byRowId = [{ id: "copy-9", bowl_id: "bowl-1" }];
    mocks.state.bowlRows = [{ id: "bowl-1", name: "First Bowl" }];

    const matches = await findOwnUndrawnBowlCopies({ tmdbId: -42, bowlMovieId: "copy-9" });

    expect(matches).toEqual([{ id: "copy-9", bowlId: "bowl-1", bowlName: "First Bowl" }]);
    expect(mocks.state.movieQueries).toHaveLength(1);
    expect(mocks.state.movieQueries[0].id).toBe("copy-9");
  });

  it("offers the drawn copy once when both lookups find it", async () => {
    mocks.state.byTmdbId = [
      { id: "copy-1", bowl_id: "bowl-1" },
      { id: "copy-2", bowl_id: "bowl-2" },
    ];
    mocks.state.byRowId = [{ id: "copy-1", bowl_id: "bowl-1" }];
    mocks.state.bowlRows = [
      { id: "bowl-1", name: "First Bowl" },
      { id: "bowl-2", name: "Second Bowl" },
    ];

    const matches = await findOwnUndrawnBowlCopies({ tmdbId: 500, bowlMovieId: "copy-1" });

    expect(matches.map((match) => match.id)).toEqual(["copy-1", "copy-2"]);
  });

  it("drops a copy whose bowl no longer resolves", async () => {
    mocks.state.byTmdbId = [
      { id: "copy-1", bowl_id: "bowl-1" },
      { id: "copy-2", bowl_id: "bowl-gone" },
    ];
    mocks.state.bowlRows = [{ id: "bowl-1", name: "First Bowl" }];

    const matches = await findOwnUndrawnBowlCopies({ tmdbId: 500 });

    expect(matches.map((match) => match.id)).toEqual(["copy-1"]);
  });

  it("asks for nothing without a title or a row", async () => {
    expect(await findOwnUndrawnBowlCopies({})).toEqual([]);
    expect(await findOwnUndrawnBowlCopies({ tmdbId: -12 })).toEqual([]);
    expect(mocks.supabase.from).not.toHaveBeenCalled();
  });

  it("degrades to offering nothing when the lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.state.moviesError = { message: "network down" };

    expect(await findOwnUndrawnBowlCopies({ tmdbId: 500 })).toEqual([]);
  });
});

describe("removeOwnBowlCopies", () => {
  it("deletes only your own undrawn copies", async () => {
    const result = await removeOwnBowlCopies(["copy-1", "copy-2"]);

    expect(result.ok).toBe(true);
    expect(result.userId).toBe("user-1");
    expect(mocks.state.deleteFilters).toMatchObject({
      id: ["copy-1", "copy-2"],
      added_by: "user-1",
      drawn_at: null,
    });
  });

  it("reports a failed delete", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.state.deleteError = { message: "network down" };

    const result = await removeOwnBowlCopies(["copy-1"]);

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Could not remove it from your bowls. Please try again.");
  });

  it("does nothing with an empty selection", async () => {
    const result = await removeOwnBowlCopies([]);

    expect(result.ok).toBe(false);
    expect(mocks.state.deleteFilters).toBeNull();
  });
});
