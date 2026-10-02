import { describe, expect, it, vi } from "vitest";
import {
  discoverWithFallback,
  getModelProviders,
  interpretDescription,
  normalizeInterpretation,
  parseModelJson,
  parseTermsParam,
  resolveTerms,
} from "../_lib/describedSearch.js";

const reply = (content, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => ({ choices: [{ message: { content } }] }),
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
      people: ["Matt Damon", "Jessica Chastain"],
      genres: ["Science Fiction", "Drama"],
      keywords: ["stranded", "mars"],
      yearFrom: 2010,
      yearTo: 2019,
    });
    expect(normalizeInterpretation({ yearFrom: "soon" }).yearFrom).toBeNull();
    expect(normalizeInterpretation(null)).toBeNull();
  });

  it("falls through to the next provider when one is over its limit, and reports none answering", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply("", 429))
      .mockResolvedValueOnce(reply('{"people":["Matt Damon"],"genres":[],"keywords":[]}'));
    const terms = await interpretDescription("space movie with matt damon", { providers: PROVIDERS, fetchImpl });
    expect(terms.people).toEqual(["Matt Damon"]);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(["https://groq.test", "https://cf.test"]);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).response_format).toEqual({ type: "json_object" });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).response_format).toBeUndefined();

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
    expect(parseTermsParam("not json")).toBeNull();
    expect(parseTermsParam(JSON.stringify([{ kind: "genre", id: -1 }]))).toBeNull();
    expect(parseTermsParam(JSON.stringify([{ kind: "sql", id: 1 }]))).toBeNull();
    expect(parseTermsParam(JSON.stringify(Array(9).fill({ kind: "genre", id: 1 })))).toBeNull();
  });
});
