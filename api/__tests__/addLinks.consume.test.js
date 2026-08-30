import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const providerLookupMock = vi.fn();
vi.mock("../_lib/providerLinks.js", () => ({ fetchProviderLinks: providerLookupMock }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getSupabaseAdmin: () => ({
    rpc: rpcMock,
  }),
}));

import handler from "../add-links/consume.js";

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

describe("api/add-links/consume", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    providerLookupMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects non-POST requests", async () => {
    const res = createRes();
    await handler({ method: "GET" }, res);
    expect(res.statusCode).toBe(405);
  });

  it("consumes a valid add link", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          bowl_id: "bowl-1",
          bowl_name: "Weekend Bowl",
          remaining_adds: 2,
          link_id: "link-1",
          movie_id: "movie-1",
          added_by_name: "Dad",
        },
      ],
      error: null,
    });

    const res = createRes();
    await handler(
      {
        method: "POST",
        body: {
          token: "token-1",
          contributorName: "Dad",
          movie: {
            id: 123,
            title: "Jaws",
            genres: [{ name: "Thriller" }],
            note: "  Dad saw this opening weekend.  ",
          },
        },
      },
      res
    );

    expect(rpcMock).toHaveBeenCalledWith(
      "consume_bowl_add_link",
      expect.objectContaining({
        p_token: "token-1",
        p_movie: expect.objectContaining({
          tmdb_id: 123,
          title: "Jaws",
          genres: ["Thriller"],
          note: "Dad saw this opening weekend.",
        }),
        p_contributor_name: "Dad",
      })
    );
    expect(res.statusCode).toBe(200);
    expect(providerLookupMock).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({
      ok: true,
      remainingAdds: 2,
      bowlName: "Weekend Bowl",
      addedByName: "Dad",
    });
  });

  it("normalizes a blank guest comment to null", async () => {
    rpcMock.mockResolvedValue({
      data: [{ bowl_id: "bowl-1", remaining_adds: 1 }],
      error: null,
    });
    const res = createRes();

    await handler(
      {
        method: "POST",
        body: { token: "token-1", movie: { title: "Jaws", note: "  \n  " } },
      },
      res
    );

    expect(rpcMock).toHaveBeenCalledWith(
      "consume_bowl_add_link",
      expect.objectContaining({
        p_movie: expect.objectContaining({ note: null }),
      })
    );
    expect(res.statusCode).toBe(200);
  });

  it("rejects an over-limit comment before consuming the link", async () => {
    const res = createRes();

    await handler(
      {
        method: "POST",
        body: { token: "token-1", movie: { title: "Jaws", note: "x".repeat(501) } },
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      code: "comment_too_long",
      error: "Comment must be 500 characters or fewer.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns a friendly error for exhausted links", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "Add link is exhausted" },
    });

    const res = createRes();
    await handler(
      {
        method: "POST",
        body: {
          token: "token-1",
          movie: { title: "Jaws" },
        },
      },
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Add link is exhausted" });
  });

  it("returns a conflict for an active duplicate", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: "This movie is already in the bowl.",
        details: "bowl_active_tmdb_movies_pkey",
      },
    });

    const res = createRes();
    await handler(
      {
        method: "POST",
        body: {
          token: "token-1",
          movie: { id: 123, title: "Jaws" },
        },
      },
      res
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      code: "duplicate_movie",
      error: "This movie is already in the bowl.",
    });
  });

  it("returns a final success with zero remaining adds when the last add consumes the link", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          bowl_id: "bowl-1",
          bowl_name: "Weekend Bowl",
          remaining_adds: 0,
          link_id: "link-1",
          movie_id: "movie-1",
          added_by_name: "Dad",
        },
      ],
      error: null,
    });

    const res = createRes();
    await handler(
      {
        method: "POST",
        body: {
          token: "token-1",
          contributorName: "Dad",
          movie: { title: "Jaws" },
        },
      },
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      remainingAdds: 0,
      bowlName: "Weekend Bowl",
      addedByName: "Dad",
    });
  });
});
