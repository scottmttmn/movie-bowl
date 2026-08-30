import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimFilterMetadataRefreshes: vi.fn(),
  refreshFilterMetadataClaim: vi.fn(),
  getUser: vi.fn(),
  admin: null,
}));

mocks.admin = { auth: { getUser: mocks.getUser } };

vi.mock("../_lib/filterMetadataRefresh.js", () => ({
  FILTER_METADATA_STALE_MS: 24 * 60 * 60 * 1000,
  claimFilterMetadataRefreshes: mocks.claimFilterMetadataRefreshes,
  refreshFilterMetadataClaim: mocks.refreshFilterMetadataClaim,
}));
vi.mock("../_lib/supabaseAdmin.js", () => ({
  getSupabaseAdmin: () => mocks.admin,
}));

import handler from "../_lib/warmFilterMetadata.js";

const BOWL_ID = "10000000-0000-4000-8000-000000000001";

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

describe("api/tmdb/movie/warm-filter-metadata", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.claimFilterMetadataRefreshes.mockReset();
    mocks.refreshFilterMetadataClaim.mockReset();
  });

  it("validates the request and authentication", async () => {
    const invalidRes = createRes();
    await handler({ method: "POST", body: { id: 10, bowlId: "not-a-bowl" }, headers: {} }, invalidRes);
    expect(invalidRes.statusCode).toBe(400);

    const authRes = createRes();
    await handler({ method: "POST", body: { id: 10, bowlId: BOWL_ID }, headers: {} }, authRes);
    expect(authRes.statusCode).toBe(401);
  });

  it("does not call TMDB when the shared snapshot is already current", async () => {
    mocks.claimFilterMetadataRefreshes.mockResolvedValue([]);
    const res = createRes();

    await handler({
      method: "POST",
      body: { id: 10, bowlId: BOWL_ID },
      headers: { authorization: "Bearer user-token" },
    }, res);

    expect(res.statusCode).toBe(202);
    expect(res.body).toEqual({ status: "current" });
    expect(mocks.refreshFilterMetadataClaim).not.toHaveBeenCalled();
  });

  it("refreshes one authorized active movie", async () => {
    const claim = { tmdb_id: 10, region: "US", refresh_token: "claim-10" };
    mocks.claimFilterMetadataRefreshes.mockResolvedValue([claim]);
    mocks.refreshFilterMetadataClaim.mockResolvedValue({ ok: true, tmdbId: 10 });
    const res = createRes();

    await handler({
      method: "POST",
      body: { id: 10, bowlId: BOWL_ID },
      headers: { authorization: "Bearer user-token" },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: "refreshed" });
    expect(mocks.refreshFilterMetadataClaim).toHaveBeenCalledWith(mocks.admin, claim);
    expect(mocks.claimFilterMetadataRefreshes).toHaveBeenCalledWith(
      mocks.admin,
      expect.objectContaining({
        limit: 1,
        tmdbId: 10,
        bowlId: BOWL_ID,
        userId: "user-1",
      })
    );
  });
});
