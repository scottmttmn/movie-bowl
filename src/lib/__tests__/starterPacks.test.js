import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ supabase: {} }));
vi.mock("../tmdbApi", () => ({ getTmdbMovieDetails: vi.fn() }));
vi.mock("../bowlChanges", () => ({ notifyBowlChange: vi.fn() }));

import {
  clearStarterPackPeopleCache,
  fetchStarterPackCandidates,
  fetchStarterPackPeople,
  getStarterPackPhotoUrl,
  installStarterPack,
  removeStarterPack,
} from "../starterPacks";

function harness({ rpc = { data: null, error: null } } = {}) {
  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "token" } }, error: null })) },
    rpc: vi.fn(async () => rpc),
  };
  const publish = vi.fn();
  const offline = vi.fn(() => false);
  return { client, publish, offline };
}

const candidates = [11, 12, 13].map((id) => ({ id, title: `Movie ${id}`, release_date: "1985-01-01", poster_path: `/p${id}.jpg` }));
const details = (id) => ({ id, title: `Movie ${id}`, runtime: 100 + id, genres: [{ id: 1, name: "Drama" }], overview: "Plot", release_date: "1985-01-02" });

describe("fetchStarterPackCandidates", () => {
  it("asks the signed-in candidates route and returns its list", async () => {
    const h = harness();
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ candidates }) }));
    await expect(fetchStarterPackCandidates("nolan-2000s", { client: h.client, fetchImpl })).resolves.toEqual(candidates);
    expect(fetchImpl).toHaveBeenCalledWith("/api/starter-packs/candidates?pack=nolan-2000s", {
      headers: { Authorization: "Bearer token" },
    });
  });

  it("passes the route's own refusal through", async () => {
    const h = harness();
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({ error: "The Nolan: The '00s pack is unavailable right now." }) }));
    await expect(fetchStarterPackCandidates("nolan-2000s", { client: h.client, fetchImpl }))
      .rejects.toThrow("The Nolan: The '00s pack is unavailable right now.");
  });
});

describe("installStarterPack", () => {
  it("samples what the bowl has never held, looks each up, and installs them under the pack's name", async () => {
    const h = harness({ rpc: { data: { inserted: [11, 13], already_in_bowl: [], over_limit: [] }, error: null } });
    const getDetails = vi.fn(async (id) => details(id));
    const result = await installStarterPack({
      bowlId: "bowl-1", slug: "nolan-2000s", heldTmdbIds: [12], packSlipCount: 0,
      client: h.client, fetchCandidates: async () => candidates, getDetails, randomFn: () => 0,
      offline: h.offline, publish: h.publish,
    });

    expect(result).toEqual({ ok: true, inserted: 2, message: "Added 2 titles from the Nolan: The '00s pack." });
    expect(getDetails.mock.calls.map(([id]) => id)).toEqual([11, 13]);
    expect(h.client.rpc).toHaveBeenCalledWith("install_bowl_starter_pack", {
      p_bowl_id: "bowl-1",
      p_pack_slug: "nolan-2000s",
      p_pack_name: "Nolan: The '00s",
      p_movies: [11, 13].map((id) => ({
        tmdb_id: id, title: `Movie ${id}`, poster_path: `/p${id}.jpg`, release_date: "1985-01-02",
        runtime: 100 + id, genres: ["Drama"], overview: "Plot",
      })),
    });
    expect(h.publish).toHaveBeenCalledWith({ type: "context", bowlId: "bowl-1" });
  });

  it("offers only the room left under the cap, and says what was skipped", async () => {
    const h = harness({ rpc: { data: { inserted: [11], already_in_bowl: [12], over_limit: [] }, error: null } });
    const result = await installStarterPack({
      bowlId: "bowl-1", slug: "nolan-2000s", packSlipCount: 13,
      client: h.client, fetchCandidates: async () => candidates, getDetails: async (id) => details(id), randomFn: () => 0,
      offline: h.offline, publish: h.publish,
    });
    expect(h.client.rpc.mock.calls[0][1].p_movies).toHaveLength(2);
    expect(result.message).toBe("Added 1 title from the Nolan: The '00s pack. 1 was already in the bowl or over the limit.");
  });

  it("leaves out a title whose details will not load, rather than failing the pack", async () => {
    const h = harness({ rpc: { data: { inserted: [11, 12], already_in_bowl: [], over_limit: [] }, error: null } });
    await installStarterPack({
      bowlId: "bowl-1", slug: "nolan-2000s",
      client: h.client, fetchCandidates: async () => candidates,
      getDetails: async (id) => { if (id === 13) throw new Error("TMDB down"); return details(id); },
      randomFn: () => 0, offline: h.offline, publish: h.publish,
    });
    expect(h.client.rpc.mock.calls[0][1].p_movies.map((movie) => movie.tmdb_id)).toEqual([11, 12]);
  });

  it("does not call the database when there is nothing to offer, or no room", async () => {
    const h = harness();
    const exhausted = await installStarterPack({
      bowlId: "bowl-1", slug: "nolan-2000s", heldTmdbIds: [11, 12, 13],
      client: h.client, fetchCandidates: async () => candidates, getDetails: vi.fn(), offline: h.offline, publish: h.publish,
    });
    expect(exhausted).toMatchObject({ ok: false, code: "pack_exhausted" });
    const full = await installStarterPack({
      bowlId: "bowl-1", slug: "nolan-2000s", packSlipCount: 15,
      client: h.client, fetchCandidates: vi.fn(), offline: h.offline, publish: h.publish,
    });
    expect(full).toMatchObject({ ok: false, message: "The bowl already holds 15 titles from this pack." });
    expect(h.client.rpc).not.toHaveBeenCalled();
  });

  it("shows the database's refusal, and hides an unexpected error behind the fallback", async () => {
    const refused = harness({ rpc: { data: null, error: { code: "P0001", message: "This bowl already has a starter pack. Remove it before adding another." } } });
    await expect(installStarterPack({
      bowlId: "bowl-1", slug: "nolan-2000s", client: refused.client, fetchCandidates: async () => candidates,
      getDetails: async (id) => details(id), offline: refused.offline, publish: refused.publish,
    })).resolves.toEqual({ ok: false, message: "This bowl already has a starter pack. Remove it before adding another." });

    const broken = harness();
    await expect(installStarterPack({
      bowlId: "bowl-1", slug: "nolan-2000s", client: broken.client,
      fetchCandidates: async () => { throw new Error("candidates body was not JSON"); },
      offline: broken.offline, publish: broken.publish,
    })).resolves.toEqual({ ok: false, message: "Could not add the starter pack. Please try again." });
    expect(broken.publish).not.toHaveBeenCalled();
  });

  it("refuses an unknown pack and an offline device before any request", async () => {
    const h = harness();
    await expect(installStarterPack({ bowlId: "bowl-1", slug: "nope", client: h.client })).resolves.toMatchObject({ ok: false });
    h.offline.mockReturnValue(true);
    const fetchCandidates = vi.fn();
    await expect(installStarterPack({ bowlId: "bowl-1", slug: "nolan-2000s", client: h.client, fetchCandidates, offline: h.offline }))
      .resolves.toMatchObject({ ok: false });
    expect(fetchCandidates).not.toHaveBeenCalled();
  });
});

describe("removeStarterPack", () => {
  it("removes the pack and says how many of its titles went", async () => {
    const h = harness({ rpc: { data: 12, error: null } });
    await expect(removeStarterPack({ bowlId: "bowl-1", client: h.client, offline: h.offline, publish: h.publish }))
      .resolves.toEqual({ ok: true, removed: 12, message: "Removed the pack and its 12 titles still in the bowl." });
    expect(h.client.rpc).toHaveBeenCalledWith("remove_bowl_starter_pack", { p_bowl_id: "bowl-1" });
    expect(h.publish).toHaveBeenCalledWith({ type: "context", bowlId: "bowl-1" });
  });

  it("passes a permission refusal through", async () => {
    const h = harness({ rpc: { data: null, error: { code: "42501", message: "Only the bowl owner can remove a starter pack." } } });
    await expect(removeStarterPack({ bowlId: "bowl-1", client: h.client, offline: h.offline, publish: h.publish }))
      .resolves.toEqual({ ok: false, message: "Only the bowl owner can remove a starter pack." });
  });
});

describe("fetchStarterPackPeople", () => {
  it("asks once a session, through the signed-in route", async () => {
    clearStarterPackPeopleCache();
    const h = harness();
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ people: { "Tom Hanks": "/hanks.jpg" } }) }));
    await expect(fetchStarterPackPeople({ client: h.client, fetchImpl })).resolves.toEqual({ "Tom Hanks": "/hanks.jpg" });
    await fetchStarterPackPeople({ client: h.client, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("/api/starter-packs/people", {
      cache: "no-store",
      headers: { Authorization: "Bearer token" },
    });
  });

  it("resolves to no photos when the route fails, and asks again next time", async () => {
    clearStarterPackPeopleCache();
    const h = harness();
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }));
    await expect(fetchStarterPackPeople({ client: h.client, fetchImpl })).resolves.toEqual({});
    await fetchStarterPackPeople({ client: h.client, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("getStarterPackPhotoUrl", () => {
  it("builds TMDB's image URL from a profile path, and nothing without one", () => {
    expect(getStarterPackPhotoUrl("/hanks.jpg")).toBe("https://image.tmdb.org/t/p/w342/hanks.jpg");
    expect(getStarterPackPhotoUrl(null)).toBeNull();
  });
});
