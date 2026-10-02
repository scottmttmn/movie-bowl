import { describe, expect, it, vi } from "vitest";
import {
  discoverMovies,
  discoverWithFallback,
  getModelProviders,
  interpretDescription,
  normalizeInterpretation,
  parseModelJson,
  parseTermsParam,
  resolveTerms,
  verifyTitles,
} from "../_lib/describedSearch.js";

const reply = (content, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => ({ choices: [{ message: { content } }] }),
  text: async () => (status >= 400 ? "model retired" : content),
});

const PROVIDERS = [
  { name: "groq", url: "https://groq.test", key: "g", model: "m", jsonMode: true },
  { name: "cloudflare", url: "https://cf.test", key: "c", model: "m", jsonMode: false },
];

describe("described search: reading the description", () => {
  it("configures only the providers whose secrets are set, Groq first", () => {
    expect(getModelProviders({})).toEqual([]);
    expect(getModelProviders({ CLOUDFLARE_ACCOUNT_ID: "a" })).toEqual([]);
    expect(getModelProviders({ GROQ_API_KEY: "g", CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AI_TOKEN: "t" }).map((p) => p.name))
      .toEqual(["groq", "cloudflare"]);
    // Llama 3.1 8B was retired on Cloudflare and answered 410.
    const cloudflare = getModelProviders({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AI_TOKEN: "t" })[0];
    expect(cloudflare.model).toBe("@cf/openai/gpt-oss-20b");
    expect(cloudflare.extra).toEqual({ reasoning_effort: "low" });
    // 120B at low found as many test-set answers as at medium, in half the time.
    const groq = getModelProviders({ GROQ_API_KEY: "g" })[0];
    expect(groq.model).toBe("openai/gpt-oss-120b");
    expect(groq.extra.reasoning_effort).toBe("low");
    expect(getModelProviders({ GROQ_API_KEY: "g", GROQ_REASONING_EFFORT: "medium" })[0].extra.reasoning_effort).toBe("medium");
    expect(getModelProviders({ CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AI_TOKEN: "t", CLOUDFLARE_AI_MODEL: "@cf/x" })[0].model).toBe("@cf/x");
  });

  it("finds the JSON in a reply that wraps it in prose", () => {
    expect(parseModelJson('Sure! ```json\n{"people":["Matt Damon"]}\n```')).toEqual({ people: ["Matt Damon"] });
    expect(parseModelJson("no json here")).toBeNull();
    expect(parseModelJson("{broken")).toBeNull();
  });

  it("keeps only known genres, sane years and short de-duplicated lists", () => {
    expect(normalizeInterpretation({
      people: ["Matt Damon", "matt damon", "Jessica Chastain", "Third Person"],
      genres: ["science fiction", "Space Opera", "Drama"],
      keywords: ["stranded", "mars", "rescue"],
      yearFrom: 2019,
      yearTo: 2010,
    })).toEqual({
      titles: [],
      people: ["Matt Damon", "Jessica Chastain"],
      genres: ["Science Fiction", "Drama"],
      keywords: ["stranded", "mars"],
      yearFrom: 2010,
      yearTo: 2019,
      language: null,
    });
    expect(normalizeInterpretation({ yearFrom: "soon" }).yearFrom).toBeNull();
    const named = normalizeInterpretation({
      titles: [{ title: "Apocalypse Now", year: 1979 }, "apocalypse now", "Platoon", { title: "" }, { title: "Full Metal Jacket" }, { title: "Fourth" }],
      language: "ZH",
    });
    expect(named.titles).toEqual([
      { title: "Apocalypse Now", year: 1979 },
      { title: "Platoon", year: null },
      { title: "Full Metal Jacket", year: null },
    ]);
    expect(named.language).toBe("zh");
    expect(normalizeInterpretation({ language: "Chinese" }).language).toBeNull();
    expect(normalizeInterpretation(null)).toBeNull();
  });

  it("falls through to the next provider when one is over its limit, and reports none answering", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply("", 429))
      .mockResolvedValueOnce(reply('{"people":["Matt Damon"],"genres":[],"keywords":[]}'));
    const terms = await interpretDescription("space movie with matt damon", { providers: PROVIDERS, fetchImpl });
    expect(terms.people).toEqual(["Matt Damon"]);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(["https://groq.test", "https://cf.test"]);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).response_format).toEqual({ type: "json_object" });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).response_format).toBeUndefined();
    // A misspelled or described person reaches the model too, so it is asked for them.
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).messages[0].content).toMatch(/names, misspells or describes/);
    expect(warn).toHaveBeenCalledWith("[api/tmdb/search] groq answered 429", "model retired");

    // An empty answer is no answer: the next provider is asked, and the raw
    // text is logged.
    const hollow = vi.fn()
      .mockResolvedValueOnce(reply('{"titles":[],"people":[],"genres":[],"keywords":[]}'))
      .mockResolvedValueOnce(reply('{"terms":{"people":["Brad Pitt"]}}'));
    expect((await interpretDescription("brad pitt baseball movie", { providers: PROVIDERS, fetchImpl: hollow })).people).toEqual(["Brad Pitt"]);
    expect(warn).toHaveBeenCalledWith("[api/tmdb/search] groq returned no usable terms", '{"titles":[],"people":[],"genres":[],"keywords":[]}');

    const down = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(reply("not json"));
    expect(await interpretDescription("x y z", { providers: PROVIDERS, fetchImpl: down })).toBeNull();
    expect(await interpretDescription("x y z", { providers: [], fetchImpl: down })).toBeNull();
  });
});

describe("described search: finding the movies", () => {
  it("resolves names TMDB actually has and drops the rest", async () => {
    const fetchTmdb = vi.fn(async (path) => {
      if (path.startsWith("/search/person?query=Matt%20Damon")) {
        return { results: [{ id: 9, name: "Matt Damon Jr", popularity: 1 }, { id: 1892, name: "Matt Damon", popularity: 40 }] };
      }
      if (path.startsWith("/search/person")) return { results: [{ id: 5, name: "Someone Else", popularity: 90 }] };
      if (path.startsWith("/search/keyword?query=stranded")) return { results: [{ id: 3, name: "stranded on a planet" }, { id: 4, name: "stranded" }] };
      return { results: [] };
    });
    const terms = await resolveTerms({
      people: ["Matt Damon", "Nobody Real"], genres: ["Science Fiction"], keywords: ["stranded", "zzz"], yearFrom: 2010, yearTo: 2019,
    }, fetchTmdb);
    expect(terms).toEqual([
      { kind: "person", id: 1892, label: "Matt Damon" },
      { kind: "genre", id: 878, label: "Science Fiction" },
      { kind: "keyword", id: 4, label: "stranded" },
      { kind: "years", from: 2010, to: 2019, label: "2010s" },
    ]);
  });

  it("keeps only the titles TMDB has, by those exact words, nearest that year", async () => {
    const fetchTmdb = vi.fn(async (path) => {
      if (path.includes("query=Apocalypse%20Now")) {
        return { results: [
          { id: 1, title: "Apocalypse Now Redux", release_date: "2001-05-11", popularity: 90 },
          { id: 28, title: "Apocalypse Now", release_date: "1979-08-15", popularity: 30 },
        ] };
      }
      if (path.includes("query=Alien")) return { results: [{ id: 679, title: "Aliens", release_date: "1986-07-18", popularity: 50 }] };
      // TMDB finds it only once the model's hyphen is closed up.
      if (path.includes("query=Chung-King")) return { results: [] };
      if (path.includes("query=ChungKing%20Express") || path.includes("query=Chungking%20Express")) {
        return { results: [{ id: 11104, title: "Chungking Express", original_title: "重慶森林", release_date: "1994-07-14", popularity: 20 }] };
      }
      if (path.includes("query=Broken")) throw new Error("TMDB down");
      if (path.includes("query=Heat")) {
        return { results: [
          { id: 949, title: "Heat", release_date: "1995-12-15", popularity: 40 },
          { id: 10, title: "Heat", release_date: "1986-03-14", popularity: 5 },
        ] };
      }
      if (path.includes("query=The%20Empire%20Strikes%20Back")) return { results: [{ id: 1891, title: "The Empire Strikes Back", release_date: "1980-05-20", popularity: 30 }] };
      if (path.includes("query=Part%20Two")) return { results: [{ id: 77, title: "Part Two", release_date: "2011-01-01", popularity: 1 }] };
      if (path.includes("query=My%20Dinner")) return { results: [{ id: 25468, title: "My Dinner with Andre", release_date: "1981-10-11", popularity: 8 }] };
      return { results: [] };
    });
    const found = await verifyTitles([
      { title: "Apocalypse Now", year: 1979 },
      { title: "Alien", year: 1979 },
      { title: "Chung\u2011King Express", year: 1994 },
      { title: "Heat", year: 1986 },
      { title: "My Dinner with Andre", year: 1978 },
      // TMDB files a sequel under its subtitle, but a bare subtitle must agree on the year.
      { title: "Star Wars: Episode V \u2013 The Empire Strikes Back", year: 1980 },
      { title: "Dune: Part Two", year: 2024 },
      { title: "A Movie Nobody Made", year: null },
      { title: "Broken", year: null },
    ], fetchTmdb);
    // A remake goes to the nearer year; a misremembered year drops nothing.
    expect(found.map((movie) => movie.id)).toEqual([28, 11104, 10, 25468, 1891]);
    expect(fetchTmdb.mock.calls.map(([path]) => path).filter((path) => path.includes("Chung")))
      .toEqual(expect.arrayContaining([expect.stringContaining("query=Chung-King%20Express"), expect.stringContaining("query=ChungKing%20Express")]));
  });

  it("searches a language by every code TMDB files it under", async () => {
    const terms = await resolveTerms({ people: [], genres: [], keywords: [], yearFrom: null, yearTo: null, language: "zh" }, vi.fn());
    expect(terms).toEqual([{ kind: "language", code: "zh", label: "Chinese" }]);
    const fetchTmdb = vi.fn(async (path) => (
      path.includes("with_original_language=cn")
        ? { results: [{ id: 11104, title: "Chungking Express", popularity: 20 }, { id: 2, title: "Both", popularity: 5 }] }
        : { results: [{ id: 3, title: "Hero", popularity: 30 }, { id: 2, title: "Both", popularity: 5 }] }
    ));
    const found = await discoverMovies(terms, fetchTmdb);
    expect(found.map((movie) => movie.id)).toEqual([3, 11104, 2]);
    expect(fetchTmdb).toHaveBeenCalledTimes(2);

    const korean = vi.fn(async () => ({ results: [] }));
    await discoverMovies([{ kind: "language", code: "ko", label: "Korean" }], korean);
    expect(korean.mock.calls.map(([path]) => path.match(/with_original_language=(\w+)/)[1])).toEqual(["ko"]);
  });

  it("drops keywords, then genres, until something is found, and reports the terms it used", async () => {
    const terms = [
      { kind: "person", id: 1892, label: "Matt Damon" },
      { kind: "genre", id: 878, label: "Science Fiction" },
      { kind: "keyword", id: 4, label: "stranded" },
    ];
    const fetchTmdb = vi.fn(async (path) => (
      path.includes("with_keywords") ? { results: [] } : { results: [{ id: 286217, title: "The Martian" }, { id: 7, title: "x", adult: true }] }
    ));
    const found = await discoverWithFallback(terms, fetchTmdb);
    expect(found.terms.map((term) => term.label)).toEqual(["Matt Damon", "Science Fiction"]);
    expect(found.results).toEqual([{ id: 286217, title: "The Martian" }]);
    expect(fetchTmdb.mock.calls[0][0]).toContain("with_people=1892");
    expect(fetchTmdb.mock.calls[0][0]).toContain("with_keywords=4");

    const nothing = await discoverWithFallback(terms, vi.fn(async () => ({ results: [] })));
    expect(nothing).toEqual({ terms: [], results: [] });
  });

  it("accepts only well-formed terms back from the client", () => {
    expect(parseTermsParam(JSON.stringify([{ kind: "genre", id: 878, label: "Science Fiction" }, { kind: "years", from: 1990, to: 1999 }])))
      .toEqual([{ kind: "genre", id: 878, label: "Science Fiction" }, { kind: "years", from: 1990, to: 1999, label: "1990s" }]);
    expect(parseTermsParam(JSON.stringify([{ kind: "language", code: "fr", label: "<b>" }])))
      .toEqual([{ kind: "language", code: "fr", label: "French" }]);
    expect(parseTermsParam(JSON.stringify([{ kind: "language", code: "fr&x=1" }]))).toBeNull();
    expect(parseTermsParam("not json")).toBeNull();
    expect(parseTermsParam(JSON.stringify([{ kind: "genre", id: -1 }]))).toBeNull();
    expect(parseTermsParam(JSON.stringify([{ kind: "sql", id: 1 }]))).toBeNull();
    expect(parseTermsParam(JSON.stringify(Array(9).fill({ kind: "genre", id: 1 })))).toBeNull();
  });
});
