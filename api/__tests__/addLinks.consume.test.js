import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

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
        }),
        p_contributor_name: "Dad",
      })
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      remainingAdds: 2,
      bowlName: "Weekend Bowl",
      addedByName: "Dad",
    });
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
