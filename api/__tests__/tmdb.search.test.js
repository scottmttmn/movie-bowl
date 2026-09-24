import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ tmdbFetch: vi.fn() }));

vi.mock("../_lib/tmdb.js", () => ({ tmdbFetch: mocks.tmdbFetch }));

import handler from "../tmdb/search.js";

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

  it("suggests the longest trim of a misspelled name that finds its person", async () => {
    fakeTmdb({ people: [{ name: "Martin Scorsese", popularity: 20 }] });
    const res = createRes();
    await handler({ method: "GET", query: { type: "suggest", query: "martin scorcese" } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ query: "martin scor" });
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
});
