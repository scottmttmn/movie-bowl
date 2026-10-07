import { describe, expect, it } from "vitest";
import {
  checkCloudflare,
  checkGroq,
  checkResend,
  checkStaging,
  checkTmdb,
  checkWatchmodeRent,
  checkWatchmodeStreaming,
  formatSummary,
  runChecks,
} from "../checks.mjs";

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url, options });
    const route = routes.find(([match]) => url.includes(match));
    if (!route) throw new Error(`unexpected ${url}`);
    return typeof route[1] === "function" ? route[1](url, options) : route[1].clone();
  };
  return Object.assign(impl, { calls });
}

const modelAnswer = (content) => json(200, { choices: [{ message: { content: JSON.stringify(content) } }] });

const env = {
  TMDB_READ_ACCESS_TOKEN: "tmdb",
  GROQ_API_KEY: "groq",
  CLOUDFLARE_ACCOUNT_ID: "acct",
  CLOUDFLARE_AI_TOKEN: "cf",
  RESEND_API_KEY: "re",
  STAGING_SUPABASE_URL: "https://staging.supabase.co/",
  STAGING_SUPABASE_ANON_KEY: "anon",
  WATCHMODE_API_KEY: "wm",
};

const source = (name, type, webUrl = `https://example.com/${type}`) => ({ name, type, region: "US", web_url: webUrl });

describe("api checks", () => {
  it("fails a check whose variables are missing, naming them", async () => {
    expect(await checkTmdb({})).toEqual({ name: "TMDB search", ok: false, detail: "TMDB_READ_ACCESS_TOKEN is not set" });
    expect((await checkCloudflare({ CLOUDFLARE_ACCOUNT_ID: "a" })).detail).toBe("CLOUDFLARE_AI_TOKEN is not set");
    expect((await checkStaging({})).detail).toBe("STAGING_SUPABASE_URL and STAGING_SUPABASE_ANON_KEY are not set");
  });

  it("passes TMDB on results and reports its error message otherwise", async () => {
    const ok = fakeFetch([["themoviedb", json(200, { results: [{ id: 346648 }] })]]);
    expect(await checkTmdb(env, ok)).toMatchObject({ ok: true, detail: "1 results for Paddington" });
    expect(ok.calls[0].options.headers.Authorization).toBe("Bearer tmdb");

    const expired = fakeFetch([["themoviedb", json(401, { status_message: "Invalid API key" })]]);
    expect(await checkTmdb(env, expired)).toMatchObject({ ok: false, detail: "HTTP 401: Invalid API key" });
  });

  it("asks each model provider on its own, so the fallback cannot hide a failure", async () => {
    const fetchImpl = fakeFetch([
      ["groq.com", json(410, { error: { message: "model decommissioned" } })],
      ["cloudflare.com", modelAnswer({ titles: [{ title: "Paddington 2", year: 2017 }], people: [], genres: [], keywords: [] })],
    ]);
    const groq = await checkGroq(env, fetchImpl);
    expect(groq.ok).toBe(false);
    expect(groq.detail).toMatch(/^HTTP 410: .*decommissioned/);
    expect(fetchImpl.calls.filter((call) => call.url.includes("cloudflare"))).toHaveLength(0);

    expect(await checkCloudflare(env, fetchImpl)).toMatchObject({ ok: true, detail: "@cf/openai/gpt-oss-20b answered: Paddington 2" });
  });

  it("tries a model twice before failing it, keeping the app's own time limit", async () => {
    const empty = fakeFetch([["groq.com", modelAnswer({ titles: [], people: [], genres: [], keywords: [] })]]);
    // What the model said comes along, since that is the only evidence of why.
    expect(await checkGroq(env, empty)).toMatchObject({
      ok: false,
      detail: 'answered with nothing usable: {"titles":[],"people":[],"genres":[],"keywords":[]}',
    });
    expect(empty.calls).toHaveLength(2);
    expect(empty.calls[0].options.signal).toBeInstanceOf(AbortSignal);

    let calls = 0;
    const second = fakeFetch([["groq.com", () => (calls++ ? modelAnswer({ titles: [], people: [], genres: ["Comedy"], keywords: [] }) : json(503, {}))]]);
    expect(await checkGroq(env, second)).toMatchObject({ ok: true, detail: "openai/gpt-oss-120b answered: Comedy" });

    const blank = fakeFetch([["groq.com", json(200, { choices: [{ message: { content: "" } }] })]]);
    expect(await checkGroq(env, blank)).toMatchObject({ ok: false, detail: "answered with nothing usable" });
  });

  it("accepts a sending-only Resend key and needs a verified domain otherwise", async () => {
    const restricted = fakeFetch([["resend.com", json(401, { name: "restricted_api_key", message: "restricted" })]]);
    expect((await checkResend(env, restricted)).ok).toBe(true);

    const verified = fakeFetch([["resend.com", json(200, { data: [{ name: "moviebowl.app", status: "verified" }] })]]);
    expect(await checkResend(env, verified)).toMatchObject({ ok: true, detail: "verified: moviebowl.app" });

    const pending = fakeFetch([["resend.com", json(200, { data: [{ name: "moviebowl.app", status: "pending" }] })]]);
    expect(await checkResend(env, pending)).toMatchObject({ ok: false, detail: "no verified sending domain (moviebowl.app pending)" });

    const invalid = fakeFetch([["resend.com", json(403, { name: "invalid_api_key", message: "API key is invalid" })]]);
    expect(await checkResend(env, invalid)).toMatchObject({ ok: false, detail: "HTTP 403: API key is invalid" });
  });

  it("counts no rows or a refused anonymous read as awake, and a rejected key or gateway error as not", async () => {
    const empty = fakeFetch([["staging.supabase.co", json(200, [])]]);
    expect(await checkStaging(env, empty)).toMatchObject({ ok: true, detail: "answered 200" });
    expect(empty.calls[0].url).toBe("https://staging.supabase.co/rest/v1/bowls?select=id&limit=1");

    const denied = fakeFetch([["staging.supabase.co", json(401, { code: "42501" })]]);
    expect((await checkStaging(env, denied)).ok).toBe(true);

    const badKey = fakeFetch([["staging.supabase.co", json(401, { code: "PGRST301", message: "JWT invalid" })]]);
    expect(await checkStaging(env, badKey)).toMatchObject({ ok: false, detail: "HTTP 401: JWT invalid" });

    const paused = fakeFetch([["staging.supabase.co", new Response("project paused", { status: 540 })]]);
    expect(await checkStaging(env, paused)).toMatchObject({ ok: false });
  });

  it("passes the streaming check only on a Netflix link the app could open", async () => {
    const ok = fakeFetch([["watchmode.com", json(200, [source("Netflix", "sub", "https://www.netflix.com/title/81458416")])]]);
    expect(await checkWatchmodeStreaming(env, ok)).toMatchObject({ ok: true, detail: "Glass Onion on Netflix: https://www.netflix.com/title/81458416" });
    expect(ok.calls[0].url).toContain("/title/movie-661374/sources/");
    expect(ok.calls[0].options.headers["X-API-Key"]).toBe("wm");

    const moved = fakeFetch([["watchmode.com", json(200, [source("Hulu", "sub"), source("Netflix", "sub", "javascript:alert(1)")])]]);
    expect(await checkWatchmodeStreaming(env, moved)).toMatchObject({ ok: false, detail: "no Netflix link for Glass Onion (got Hulu sub)" });

    const reshaped = fakeFetch([["watchmode.com", json(200, { sources: [] })]]);
    expect((await checkWatchmodeStreaming(env, reshaped)).detail).toMatch(/^Invalid Watchmode response/);
  });

  it("passes the rent check on any store's rent link and reports a spent quota", async () => {
    const ok = fakeFetch([["watchmode.com", json(200, [source("Prime Video", "buy"), source("AppleTV", "rent"), source("Amazon", "rent")])]]);
    const rent = await checkWatchmodeRent(env, ok);
    expect(rent.ok).toBe(true);
    expect(rent.detail).toMatch(/^The Shawshank Redemption for rent from /);
    expect(ok.calls[0].url).toContain("/title/movie-278/sources/");

    const buyOnly = fakeFetch([["watchmode.com", json(200, [source("Amazon", "buy")])]]);
    expect(await checkWatchmodeRent(env, buyOnly)).toMatchObject({ ok: false });

    const spent = fakeFetch([["watchmode.com", json(429, { statusMessage: "Over quota" })]]);
    expect(await checkWatchmodeRent(env, spent)).toMatchObject({ ok: false, detail: "HTTP 429: Over quota" });
    expect((await checkWatchmodeRent({})).detail).toBe("WATCHMODE_API_KEY is not set");
  });

  it("runs every check and summarizes failures first", async () => {
    const results = await runChecks({}, fakeFetch([]));
    expect(results.map((result) => result.name)).not.toContain("Watchmode rent link");
    const weekly = await runChecks({}, fakeFetch([]), { weekly: true });
    expect(weekly).toHaveLength(results.length + 1);
    expect(weekly.at(-1).name).toBe("Watchmode rent link");
    const summary = formatSummary([...results.slice(0, 1), { name: "Groq describe", ok: true, detail: "a | b" }]);
    expect(summary.split("\n")[0]).toBe("1 of 2 API checks failed.");
    expect(summary).toContain("| Groq describe | ✅ | a \\| b |");
  });
});
