import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ tmdbFetch: vi.fn(), getUser: vi.fn() }));

vi.mock("../_lib/tmdb.js", () => ({ tmdbFetch: mocks.tmdbFetch }));
vi.mock("../_lib/supabaseAdmin.js", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser: mocks.getUser } }),
}));

import handler from "../_lib/starterPackCandidates.js";

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

const signedIn = (pack) => ({ method: "GET", query: { pack }, headers: { authorization: "Bearer token" } });

describe("starter pack candidates", () => {
  beforeEach(() => {
    mocks.tmdbFetch.mockReset();
    mocks.getUser.mockReset();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  });

  it("refuses the wrong method, an unknown pack, and anyone not signed in", async () => {
    const posted = createRes();
    await handler({ method: "POST", query: { pack: "spielberg-1980s" } }, posted);
    expect(posted.statusCode).toBe(405);

    const unknown = createRes();
    await handler(signedIn("not-a-pack"), unknown);
    expect(unknown.statusCode).toBe(400);

    const anonymous = createRes();
    await handler({ method: "GET", query: { pack: "spielberg-1980s" }, headers: {} }, anonymous);
    expect(anonymous.statusCode).toBe(401);

    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("bad token") });
    const badToken = createRes();
    await handler(signedIn("spielberg-1980s"), badToken);
    expect(badToken.statusCode).toBe(401);
    expect(mocks.tmdbFetch).not.toHaveBeenCalled();
  });

  it("resolves a filmography pack live from the person's credits", async () => {
    mocks.tmdbFetch.mockImplementation(async (path) => {
      if (path.startsWith("/search/person")) {
        return { results: [{ id: 488, name: "Steven Spielberg", known_for_department: "Directing" }] };
      }
      return {
        cast: [],
        crew: [
          { id: 85, title: "Raiders of the Lost Ark", job: "Director", release_date: "1981-06-12", vote_count: 12000, genre_ids: [12] },
          { id: 601, title: "E.T. the Extra-Terrestrial", job: "Director", release_date: "1982-06-11", vote_count: 11000, genre_ids: [878] },
          { id: 329, title: "Jurassic Park", job: "Director", release_date: "1993-06-11", vote_count: 16000, genre_ids: [12] },
          { id: 999, title: "Produced Only", job: "Producer", release_date: "1985-01-01", vote_count: 5000, genre_ids: [18] },
        ],
      };
    });
    const res = createRes();
    await handler(signedIn("spielberg-1980s"), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.pack).toEqual({ slug: "spielberg-1980s", name: "Spielberg: The '80s" });
    expect(res.body.candidates.map((movie) => movie.title).sort()).toEqual(["E.T. the Extra-Terrestrial", "Raiders of the Lost Ark"]);
    expect(mocks.tmdbFetch).toHaveBeenCalledWith("/person/488/movie_credits?language=en-US");
  });

  it("matches each Best Picture winner of the decade by title and year", async () => {
    mocks.tmdbFetch.mockImplementation(async (path) => {
      const title = decodeURIComponent(path.match(/query=([^&]*)/)[1]);
      const year = { "Dances with Wolves": 1990, "The Silence of the Lambs": 1991, Unforgiven: 1992,
        "Schindler's List": 1993, "Forrest Gump": 1994, Braveheart: 1995, "The English Patient": 1996,
        Titanic: 1997, "Shakespeare in Love": 1998, "American Beauty": 1999 }[title];
      return { results: [{ id: year, title, release_date: `${year}-06-01` }, { id: year + 5000, title, release_date: "1953-01-01" }] };
    });
    const res = createRes();
    await handler(signedIn("best-picture-1990s"), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.candidates).toHaveLength(10);
    expect(res.body.candidates.map((movie) => movie.id)).toContain(1997);
  });

  it("reports a pack it cannot resolve without guessing, and names it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.tmdbFetch.mockResolvedValue({ results: [] });
    const res = createRes();
    await handler(signedIn("best-picture-1990s"), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: "The Best Picture Winners: The '90s pack is unavailable right now." });
    consoleError.mockRestore();
  });

  it("answers a TMDB failure with a generic bad gateway", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.tmdbFetch.mockImplementation(async () => {
      throw new Error("TMDB request failed");
    });
    const res = createRes();
    await handler(signedIn("spielberg-1980s"), res);

    expect(res.statusCode).toBe(502);
    expect(consoleError).toHaveBeenCalledWith("[api/starter-packs/candidates] Failed to resolve a starter pack", expect.any(Error));
    consoleError.mockRestore();
  });
});
