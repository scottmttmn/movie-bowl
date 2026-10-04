import { describe, expect, it } from "vitest";
import { checkCloudflare, checkGroq, checkResend, checkStaging, checkTmdb, formatSummary, runChecks } from "../checks.mjs";

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
};

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

  it("fails a model that answers with nothing usable", async () => {
    const fetchImpl = fakeFetch([["groq.com", modelAnswer({ titles: [], people: [], genres: [], keywords: [] })]]);
    expect(await checkGroq(env, fetchImpl)).toMatchObject({ ok: false, detail: "answered with nothing usable" });
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

  it("counts any database answer from staging as awake, and a gateway error as not", async () => {
    const denied = fakeFetch([["staging.supabase.co", json(401, { code: "42501" })]]);
    expect(await checkStaging(env, denied)).toMatchObject({ ok: true, detail: "answered 401" });
    expect(denied.calls[0].url).toBe("https://staging.supabase.co/rest/v1/bowls?select=id&limit=1");

    const paused = fakeFetch([["staging.supabase.co", new Response("project paused", { status: 540 })]]);
    expect(await checkStaging(env, paused)).toMatchObject({ ok: false });
  });

  it("runs every check and summarizes failures first", async () => {
    const results = await runChecks({}, fakeFetch([]));
    expect(results).toHaveLength(5);
    const summary = formatSummary([...results.slice(0, 1), { name: "Groq describe", ok: true, detail: "a | b" }]);
    expect(summary.split("\n")[0]).toBe("1 of 2 API checks failed.");
    expect(summary).toContain("| Groq describe | ✅ | a \\| b |");
  });
});
