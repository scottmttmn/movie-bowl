// One real call to each outside service the app depends on, so an expired
// key, a retired model or a paused project shows up as a failed check rather
// than as a feature that quietly stopped working for users.
//
// Each check takes the environment and a fetch, and answers
// { name, ok, detail }. None of them writes anything or sends an email.
import { getModelProviders, interpretDescription } from "../../api/_lib/describedSearch.js";

const TIMEOUT_MS = 20000;

// A description with an obvious answer: the check asks whether the model
// answers at all, not whether it answers well. Scoring is eval:search's job.
export const MODEL_QUERY = "the movie where a bear in a duffle coat is framed for stealing a pop-up book";

const missing = (name, variables) => ({
  name,
  ok: false,
  detail: `${variables.join(" and ")} ${variables.length > 1 ? "are" : "is"} not set`,
});

async function readBody(response) {
  const text = await response.text().catch(() => "");
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

export async function checkTmdb(env, fetchImpl = fetch) {
  const name = "TMDB search";
  const token = env.TMDB_READ_ACCESS_TOKEN;
  if (!token) return missing(name, ["TMDB_READ_ACCESS_TOKEN"]);
  try {
    const response = await fetchImpl("https://api.themoviedb.org/3/search/movie?query=Paddington&page=1&include_adult=false", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const { text, json } = await readBody(response);
    if (!response.ok) return { name, ok: false, detail: `HTTP ${response.status}: ${json?.status_message || text.slice(0, 200)}` };
    const count = json?.results?.length || 0;
    return count > 0
      ? { name, ok: true, detail: `${count} results for Paddington` }
      : { name, ok: false, detail: "answered with no results for Paddington" };
  } catch (error) {
    return { name, ok: false, detail: error.message };
  }
}

// Calls the provider exactly as the describe action does -- same prompt, model
// and settings, from the same module -- with only that one provider, so a
// fallback cannot hide the one that stopped answering.
async function checkModel(name, providerName, variables, env, fetchImpl) {
  if (variables.some((variable) => !env[variable])) return missing(name, variables.filter((variable) => !env[variable]));
  const provider = getModelProviders(env).find((candidate) => candidate.name === providerName);
  let failure = null;
  const recordingFetch = async (url, options) => {
    try {
      // The app's own five-second limit stays in force: an answer slower
      // than that never reaches anyone searching.
      const response = await fetchImpl(url, options);
      if (!response.ok) failure = `HTTP ${response.status}: ${(await response.clone().text().catch(() => "")).slice(0, 200)}`;
      return response;
    } catch (error) {
      failure = error.message;
      throw error;
    }
  };
  // The module explains each miss on console.warn, which the failure above
  // already carries; keep the run's output to one line per check.
  const warn = console.warn;
  console.warn = () => {};
  try {
    // A second try, so one slow answer on a busy minute does not open an
    // issue; two in a row is a provider the app cannot rely on today.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      failure = null;
      const interpretation = await interpretDescription(MODEL_QUERY, { providers: [provider], fetchImpl: recordingFetch });
      if (interpretation) {
        const titles = interpretation.titles.map((title) => title.title).join(", ");
        return { name, ok: true, detail: `${provider.model} answered${titles ? `: ${titles}` : ""}` };
      }
    }
    return { name, ok: false, detail: failure || "answered with nothing usable" };
  } finally {
    console.warn = warn;
  }
}

export const checkGroq = (env, fetchImpl = fetch) =>
  checkModel("Groq describe", "groq", ["GROQ_API_KEY"], env, fetchImpl);

export const checkCloudflare = (env, fetchImpl = fetch) =>
  checkModel("Cloudflare describe", "cloudflare", ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_TOKEN"], env, fetchImpl);

// Lists the sending domains, which sends nothing. A sending-only key may not
// list them, and Resend says so by name, which still proves the key works.
export async function checkResend(env, fetchImpl = fetch) {
  const name = "Resend key";
  if (!env.RESEND_API_KEY) return missing(name, ["RESEND_API_KEY"]);
  try {
    const response = await fetchImpl("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const { text, json } = await readBody(response);
    if (response.status === 401 && json?.name === "restricted_api_key") {
      return { name, ok: true, detail: "valid (a sending-only key, so domains were not listed)" };
    }
    if (!response.ok) return { name, ok: false, detail: `HTTP ${response.status}: ${json?.message || text.slice(0, 200)}` };
    const domains = json?.data || [];
    const verified = domains.filter((domain) => domain.status === "verified").map((domain) => domain.name);
    return verified.length
      ? { name, ok: true, detail: `verified: ${verified.join(", ")}` }
      : { name, ok: false, detail: `no verified sending domain (${domains.map((d) => `${d.name} ${d.status}`).join(", ") || "none"})` };
  } catch (error) {
    return { name, ok: false, detail: error.message };
  }
}

// A free Supabase project pauses after a week without requests, and a week
// with nothing merged deploys nothing to wake it. One anonymous read through
// its API is enough. The database answers it with no rows, or refuses it
// (42501) where anonymous access was revoked; either means it is awake and the
// key is good. Anything else, a rejected key included, is a failure.
export async function checkStaging(env, fetchImpl = fetch) {
  const name = "Staging database";
  const variables = ["STAGING_SUPABASE_URL", "STAGING_SUPABASE_ANON_KEY"];
  if (variables.some((variable) => !env[variable])) return missing(name, variables.filter((variable) => !env[variable]));
  try {
    const url = env.STAGING_SUPABASE_URL.replace(/\/$/, "");
    const response = await fetchImpl(`${url}/rest/v1/bowls?select=id&limit=1`, {
      headers: { apikey: env.STAGING_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.STAGING_SUPABASE_ANON_KEY}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const { text, json } = await readBody(response);
    if (response.ok) return { name, ok: true, detail: `answered ${response.status}` };
    if (json?.code === "42501") return { name, ok: true, detail: `answered ${response.status}, anonymous reads refused` };
    const paused = response.status >= 500 ? ", which can mean it is paused" : "";
    return { name, ok: false, detail: `HTTP ${response.status}${paused}: ${json?.message || text.slice(0, 200)}` };
  } catch (error) {
    return { name, ok: false, detail: error.message };
  }
}

export const CHECKS = [checkTmdb, checkGroq, checkCloudflare, checkResend, checkStaging];

export async function runChecks(env, fetchImpl = fetch) {
  const results = [];
  for (const check of CHECKS) results.push(await check(env, fetchImpl));
  return results;
}

export function formatSummary(results) {
  const failed = results.filter((result) => !result.ok);
  const lines = [
    failed.length ? `${failed.length} of ${results.length} API checks failed.` : `All ${results.length} API checks passed.`,
    "",
    "| Check | Result | Detail |",
    "| --- | --- | --- |",
    ...results.map((result) => `| ${result.name} | ${result.ok ? "✅" : "❌"} | ${String(result.detail).replace(/\|/g, "\\|").replace(/\n/g, " ")} |`),
  ];
  return `${lines.join("\n")}\n`;
}
