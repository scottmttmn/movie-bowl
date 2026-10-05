import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ tmdbFetch: vi.fn(), getUser: vi.fn() }));

vi.mock("../_lib/tmdb.js", () => ({ tmdbFetch: mocks.tmdbFetch }));
vi.mock("../_lib/supabaseAdmin.js", () => ({ getSupabaseAdmin: () => ({ auth: { getUser: mocks.getUser } }) }));

import handler from "../tmdb/search.js";
import { clearProviderListCache } from "../_lib/personOnServices.js";

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

describe("api/tmdb/search", () => {
  beforeEach(() => { mocks.tmdbFetch.mockReset(); });

  it("validates the query and page", async () => {
    const queryRes = createRes();
    await handler({ method: "GET", query: {} }, queryRes);
    expect(queryRes.statusCode).toBe(400);

    const pageRes = createRes();
    await handler({ method: "GET", query: { query: "Alien", page: "501" } }, pageRes);
    expect(pageRes.statusCode).toBe(400);
    expect(mocks.tmdbFetch).not.toHaveBeenCalled();
  });

  it("returns pagination metadata and defensively excludes adult results", async () => {
    mocks.tmdbFetch.mockResolvedValue({
      page: 2,
      total_pages: 700,
      total_results: 83,
      results: [
        { id: 1, title: "Alien", adult: false },
        { id: 2, title: "Excluded", adult: true },
      ],
    });

    const res = createRes();
    await handler({ method: "GET", query: { query: "Alien & Ripley", page: "2" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      page: 2,
      totalPages: 500,
      totalResults: 83,
      results: [{ id: 1, title: "Alien", adult: false }],
    });
    expect(mocks.tmdbFetch).toHaveBeenCalledWith(
      "/search/movie?query=Alien%20%26%20Ripley&page=2&language=en-US&region=US&include_adult=false"
    );
  });
});

describe("api/tmdb/search people actions", () => {
  beforeEach(() => { mocks.tmdbFetch.mockReset(); });

  it("rejects an unknown type without calling TMDB", async () => {
    const res = createRes();
    await handler({ method: "GET", query: { type: "keyword", query: "heist" } }, res);
    expect(res.statusCode).toBe(400);
    expect(mocks.tmdbFetch).not.toHaveBeenCalled();
  });

  it("returns only strong people matches, with what identifies them", async () => {
    mocks.tmdbFetch.mockResolvedValue({
      results: [
        {
          id: 31,
          name: "Tom Hanks",
          popularity: 60,
          profile_path: "/hanks.jpg",
          known_for_department: "Acting",
          known_for: [
            { media_type: "movie", title: "Cast Away" },
            { media_type: "tv", name: "Band of Brothers" },
            { media_type: "movie", title: "Big" },
          ],
        },
        { id: 99, name: "Tom Hankinson", popularity: 0.3, known_for: [] },
      ],
    });

    const res = createRes();
    await handler({ method: "GET", query: { type: "person", query: "tom han" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      people: [
        {
          id: 31,
          name: "Tom Hanks",
          profilePath: "/hanks.jpg",
          knownForDepartment: "Acting",
          knownFor: ["Cast Away", "Big"],
        },
      ],
    });
    expect(mocks.tmdbFetch).toHaveBeenCalledWith(
      "/search/person?query=tom%20han&page=1&language=en-US&include_adult=false"
    );
  });

  it("answers a query too long to be a name with no people rather than an error", async () => {
    const res = createRes();
    await handler({ method: "GET", query: { type: "person", query: "x".repeat(101) } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ people: [] });
    expect(mocks.tmdbFetch).not.toHaveBeenCalled();
  });

  it("does not cap the length of an ordinary title search", async () => {
    mocks.tmdbFetch.mockResolvedValue({ results: [] });
    const res = createRes();
    await handler({ method: "GET", query: { query: "something with ".repeat(10) } }, res);
    expect(res.statusCode).toBe(200);
  });

  it("validates the person id before fetching credits", async () => {
    for (const personId of [undefined, "0", "-4", "abc", "1.5"]) {
      const res = createRes();
      await handler({ method: "GET", query: { type: "person-movies", personId } }, res);
      expect(res.statusCode).toBe(400);
    }
    expect(mocks.tmdbFetch).not.toHaveBeenCalled();
  });

  it("returns a person's movies split by role", async () => {
    mocks.tmdbFetch.mockResolvedValue({
      cast: [{ id: 1, title: "Cast Away", character: "Chuck Noland", popularity: 30, release_date: "2000-12-22" }],
      crew: [
        { id: 2, title: "That Thing You Do!", job: "Director", popularity: 10 },
        { id: 3, title: "Larry Crowne", job: "Producer", popularity: 8 },
      ],
    });

    const res = createRes();
    await handler({ method: "GET", query: { type: "person-movies", personId: "31" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.personId).toBe(31);
    expect(res.body.acting.map((movie) => movie.title)).toEqual(["Cast Away"]);
    expect(res.body.acting[0].characters).toEqual(["Chuck Noland"]);
    expect(res.body.directing.map((movie) => movie.title)).toEqual(["That Thing You Do!"]);
    expect(mocks.tmdbFetch).toHaveBeenCalledWith("/person/31/movie_credits?language=en-US");
  });

  it("reports a person TMDB does not have as not found", async () => {
    mocks.tmdbFetch.mockImplementation(async () => {
      throw Object.assign(new Error("TMDB request failed"), { statusCode: 404 });
    });
    const res = createRes();
    await handler({ method: "GET", query: { type: "person-movies", personId: "31" } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Person not found" });
  });

  it("hides any other credits failure behind a generic bad gateway", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.tmdbFetch.mockImplementation(async () => {
      throw Object.assign(new Error("TMDB request failed"), { statusCode: 500 });
    });
    const res = createRes();
    await handler({ method: "GET", query: { type: "person-movies", personId: "31" } }, res);
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: "Failed to fetch TMDB credits" });
    expect(consoleError).toHaveBeenCalledWith("[api/tmdb/search] Failed to fetch person credits", expect.any(Error));
    consoleError.mockRestore();
  });
});

describe("api/tmdb/search suggest action", () => {
  beforeEach(() => { mocks.tmdbFetch.mockReset(); });

  // TMDB as far as these tests need it: a movie or person search answers only
  // queries that start the words of what it holds.
  function fakeTmdb({ titles = [], people = [] }) {
    mocks.tmdbFetch.mockImplementation(async (path) => {
      const query = decodeURIComponent(path.match(/query=([^&]*)/)[1]);
      const starts = (name) => query.split(" ").every((word) =>
        name.toLowerCase().split(" ").some((part) => part.startsWith(word.toLowerCase())));
      if (path.startsWith("/search/movie")) {
        return { results: titles.filter(starts).map((title, index) => ({ id: index + 1, title })) };
      }
      return {
        results: people.filter((person) => starts(person.name)).map((person, index) => ({ id: index + 1, ...person })),
      };
    });
  }

  it("suggests the name a misspelling was closest to", async () => {
    fakeTmdb({ people: [{ name: "Martin Scorsese", popularity: 20 }] });
    const res = createRes();
    await handler({ method: "GET", query: { type: "suggest", query: "martin scorcese" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ query: "martin scorsese" });
  });

  it("does not settle for a word that only shares the misspelling's start", async () => {
    // "scorc" finds Scorched first; Scorsese is found by "scor", and is the
    // one a letter away from what was typed.
    fakeTmdb({ titles: ["Scorched", "The Scorcher"], people: [{ name: "Martin Scorsese", popularity: 20 }] });
    const res = createRes();
    await handler({ method: "GET", query: { type: "suggest", query: "scorcese" } }, res);

    expect(res.body).toEqual({ query: "scorsese" });
  });

  it("does not stop at a fragment that finds only unrelated results", async () => {
    // TMDB returns something for the fragment, but nothing it starts.
    mocks.tmdbFetch.mockImplementation(async (path) => (path.startsWith("/search/movie")
      ? { results: [{ id: 1, title: "An Unrelated Film" }] }
      : { results: [] }));
    const res = createRes();
    await handler({ method: "GET", query: { type: "suggest", query: "zqxwvut" } }, res);

    expect(res.body).toEqual({ query: null });
  });

  it("does not suggest for a query too long to be a title", async () => {
    const res = createRes();
    await handler({ method: "GET", query: { type: "suggest", query: "x".repeat(101) } }, res);
    expect(res.body).toEqual({ query: null });
    expect(mocks.tmdbFetch).not.toHaveBeenCalled();
  });

  it("reports a failed suggestion as a bad gateway", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.tmdbFetch.mockImplementation(async () => {
      throw new Error("TMDB request failed");
    });
    const res = createRes();
    await handler({ method: "GET", query: { type: "suggest", query: "martin scorcese" } }, res);
    expect(res.statusCode).toBe(502);
    consoleError.mockRestore();
  });

  describe("described search", () => {
    const signedIn = { authorization: "Bearer token" };
    beforeEach(() => {
      mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("is for signed-in people only", async () => {
      const anonymous = createRes();
      await handler({ method: "GET", query: { type: "describe", query: "space movie with matt damon" }, headers: {} }, anonymous);
      expect(anonymous.statusCode).toBe(401);

      mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("bad token") });
      const forged = createRes();
      await handler({ method: "GET", query: { type: "describe", query: "space movie with matt damon" }, headers: signedIn }, forged);
      expect(forged.statusCode).toBe(401);
      expect(mocks.tmdbFetch).not.toHaveBeenCalled();
    });

    it("says it is unavailable when no model is configured, without touching TMDB", async () => {
      vi.stubEnv("GROQ_API_KEY", "");
      vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
      const res = createRes();
      await handler({ method: "GET", query: { type: "describe", query: "space movie with matt damon" }, headers: signedIn }, res);
      expect(res.body).toEqual({ status: "unavailable" });
      expect(mocks.tmdbFetch).not.toHaveBeenCalled();
    });

    it("returns the titles the model named and the movies TMDB found for its terms", async () => {
      vi.stubEnv("GROQ_API_KEY", "key");
      vi.stubGlobal("fetch", vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"titles":[{"title":"The Martian","year":2015}],"people":["Matt Damon"],"genres":["Science Fiction"],"keywords":[]}' } }] }),
      })));
      mocks.tmdbFetch.mockImplementation(async (path) => {
        if (path.startsWith("/search/person")) return { results: [{ id: 1892, name: "Matt Damon", popularity: 40 }] };
        if (path.startsWith("/search/movie")) return { results: [{ id: 286217, title: "The Martian", release_date: "2015-09-30" }] };
        return { results: [{ id: 286217, title: "The Martian" }, { id: 68724, title: "Elysium" }] };
      });
      const res = createRes();
      await handler({ method: "GET", query: { type: "describe", query: "space movie with matt damon" }, headers: signedIn }, res);
      expect(res.body).toEqual({
        status: "ok",
        picks: [{ id: 286217, title: "The Martian", release_date: "2015-09-30" }],
        results: [{ id: 68724, title: "Elysium" }],
      });
    });

    it("no longer searches terms sent back from the client", async () => {
      const res = createRes();
      await handler({ method: "GET", query: { type: "discover", terms: JSON.stringify([{ kind: "genre", id: 878 }]) }, headers: signedIn }, res);
      expect(res.statusCode).toBe(400);
      expect(mocks.tmdbFetch).not.toHaveBeenCalled();
    });
  });
});

describe("api/tmdb/search person-on-services", () => {
  const PROVIDERS = {
    results: [
      { provider_id: 8, provider_name: "Netflix" },
      { provider_id: 1899, provider_name: "Max" },
      { provider_id: 384, provider_name: "HBO Max" },
      { provider_id: 9, provider_name: "Amazon Prime Video" },
      { provider_id: 15, provider_name: "Hulu" },
    ],
  };

  beforeEach(() => {
    mocks.tmdbFetch.mockReset();
    clearProviderListCache();
  });

  it("validates the person and the services before asking TMDB", async () => {
    for (const query of [{ personId: "0", services: "Netflix" }, { personId: "7" }, { personId: "7", services: "Nope|Blockbuster" }]) {
      const res = createRes();
      await handler({ method: "GET", query: { type: "person-on-services", ...query } }, res);
      expect(res.statusCode).toBe(400);
    }
    expect(mocks.tmdbFetch).not.toHaveBeenCalled();
  });

  it("finds the person's movies on the viewer's services across every page", async () => {
    mocks.tmdbFetch.mockImplementation(async (path) => {
      if (path.startsWith("/watch/providers/movie")) return PROVIDERS;
      const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
      return { total_pages: 2, results: page === 1 ? [{ id: 1 }, { id: 2, adult: true }] : [{ id: 3 }, { id: 1 }] };
    });

    const res = createRes();
    await handler({ method: "GET", query: { type: "person-on-services", personId: "190", services: "Max|Prime Video|Unknown" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ personId: 190, movieIds: [1, 3] });
    const discover = mocks.tmdbFetch.mock.calls.map(([path]) => path).filter((path) => path.startsWith("/discover/movie"));
    expect(discover).toHaveLength(2);
    const params = new URLSearchParams(discover[0].split("?")[1]);
    expect(params.get("with_people")).toBe("190");
    expect(params.get("watch_region")).toBe("US");
    // Max under both of its names, Prime Video by its long one; rent and buy never count.
    expect(params.get("with_watch_providers")).toBe("1899|384|9");
    expect(params.get("with_watch_monetization_types")).toBe("flatrate|free|ads");
  });

  it("refuses an answer it could not read whole rather than cutting it short", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.tmdbFetch.mockImplementation(async (path) => (path.startsWith("/watch/providers") ? PROVIDERS : { total_pages: 26, results: [{ id: 1 }] }));
    const res = createRes();
    await handler({ method: "GET", query: { type: "person-on-services", personId: "190", services: "Netflix" } }, res);
    expect(res.statusCode).toBe(502);
    expect(mocks.tmdbFetch.mock.calls.filter(([path]) => path.startsWith("/discover"))).toHaveLength(1);
  });

  it("asks for the provider list once, not on every person", async () => {
    mocks.tmdbFetch.mockImplementation(async (path) => (path.startsWith("/watch/providers") ? PROVIDERS : { total_pages: 1, results: [] }));
    for (const personId of ["1", "2"]) {
      await handler({ method: "GET", query: { type: "person-on-services", personId, services: "Netflix" } }, createRes());
    }
    expect(mocks.tmdbFetch.mock.calls.filter(([path]) => path.startsWith("/watch/providers"))).toHaveLength(1);
  });

  it("hides a TMDB failure behind a generic bad gateway", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.tmdbFetch.mockRejectedValue(Object.assign(new Error("TMDB request failed"), { statusCode: 500 }));
    const res = createRes();
    await handler({ method: "GET", query: { type: "person-on-services", personId: "190", services: "Netflix" } }, res);
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: "Failed to check streaming services" });
  });
});
