import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const singleMock = vi.fn();
const eqMock = vi.fn(() => ({ single: singleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock("../_lib/supabaseAdmin.js", () => ({
  getSupabaseAdmin: () => ({
    from: fromMock,
  }),
}));

import handler from "../add-links/[token].js";

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

describe("api/add-links/[token]", () => {
  beforeEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
    eqMock.mockClear();
    singleMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns active link metadata", async () => {
    singleMock.mockResolvedValue({
      data: {
        bowl_id: "bowl-1",
        max_adds: 3,
        adds_used: 1,
        revoked_at: null,
        default_contributor_name: "Dad",
        bowls: { name: "Weekend Bowl" },
      },
      error: null,
    });

    const res = createRes();
    await handler({ method: "GET", query: { token: "token-1" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      status: "active",
      bowlId: "bowl-1",
      bowlName: "Weekend Bowl",
      remainingAdds: 2,
      defaultContributorName: "Dad",
    });
  });

  it("returns not_found for unknown links", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "not found" },
    });

    const res = createRes();
    await handler({ method: "GET", query: { token: "missing" } }, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      status: "not_found",
      bowlName: null,
      remainingAdds: 0,
    });
  });

  it("treats legacy revoked links as not_found", async () => {
    singleMock.mockResolvedValue({
      data: {
        bowl_id: "bowl-1",
        max_adds: 3,
        adds_used: 1,
        revoked_at: "2026-04-06T00:00:00.000Z",
        default_contributor_name: "Dad",
        bowls: { name: "Weekend Bowl" },
      },
      error: null,
    });

    const res = createRes();
    await handler({ method: "GET", query: { token: "token-1" } }, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      status: "not_found",
      bowlName: null,
      remainingAdds: 0,
    });
  });
});
