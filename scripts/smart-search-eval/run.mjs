// Runs smart search's test set: searches with a known answer, each sent
// through the same model call and TMDB lookups the describe action makes, and
// scored by where the answer lands in what the sheet would show. Trying a
// handful of searches by hand cannot tell a better model from a luckier day.
//
//   npm run eval:search                              # Groq as the app is set up
//   npm run eval:search -- --config 120b:medium,120b:low,20b:low
//   npm run eval:search -- --runs 3 --group scene    # how consistent is it?
//
// Needs GROQ_API_KEY and TMDB_READ_ACCESS_TOKEN, from the environment, .env or
// .env.local (`npx vercel env pull .env.local` fetches them). It spends the
// same free Groq quota as the app: several hundred tokens a search at low
// reasoning, against 200,000 a day.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const MODEL_NAMES = { "120b": "openai/gpt-oss-120b", "20b": "openai/gpt-oss-20b" };
const APP_TIMEOUT_MS = 5000;
const MEASURE_TIMEOUT_MS = 30000;
const LONGEST_WAIT_MS = 90000;

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    let text = "";
    try {
      text = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  }
}

function parseArgs(argv) {
  const args = { config: null, runs: 1, group: null, only: null, delay: 3000 };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split("=");
    const value = inline ?? argv[i + 1];
    if (inline === undefined && ["--config", "--runs", "--group", "--only", "--delay"].includes(flag)) i += 1;
    if (flag === "--config") args.config = value;
    else if (flag === "--runs") args.runs = Math.max(1, Number(value) || 1);
    else if (flag === "--group") args.group = value;
    else if (flag === "--only") args.only = value;
    else if (flag === "--delay") args.delay = Math.max(0, Number(value) || 0);
  }
  return args;
}

// "120b:medium" -> the model id and reasoning effort; no --config means
// whatever the app itself would use with this environment.
function parseConfigs(value) {
  if (!value) {
    return [{ label: "app default", model: process.env.GROQ_MODEL, effort: process.env.GROQ_REASONING_EFFORT }];
  }
  return value.split(",").map((entry) => {
    const [model, effort = "medium"] = entry.trim().split(":");
    return { label: `${model}:${effort}`, model: MODEL_NAMES[model] || model, effort };
  });
}

const key = (value) => String(value || "").normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const yearOf = (movie) => Number(String(movie?.release_date || "").slice(0, 4)) || null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

function isExpectedMovie(movie, expected) {
  const named = [movie?.title, movie?.original_title].some((name) => key(name) === key(expected.movie));
  const year = yearOf(movie);
  return named && (!expected.year || !year || Math.abs(year - expected.year) <= 1);
}

function score(expected, interpretation, shown) {
  if (!interpretation) return { pass: false, detail: "no answer" };
  if (expected.movie) {
    const index = shown.findIndex((movie) => isExpectedMovie(movie, expected));
    const named = interpretation.titles.some((title) => key(title.title) === key(expected.movie));
    // The model's picks lead the sheet, at most three of them, so the top
    // three is what someone sees without scrolling.
    const pass = index >= 0 && index < 3;
    const detail = index >= 0
      ? `#${index + 1}`
      : named ? "named it, but TMDB had no exact match" : "not shown";
    return { pass, rank: index >= 0 ? index + 1 : null, named, detail };
  }
  if (expected.person) {
    const pass = interpretation.people.some((name) => key(name) === key(expected.person));
    return { pass, detail: pass ? "named" : "not named" };
  }
  const want = expected.terms;
  const misses = [];
  for (const list of ["genres", "people"]) {
    for (const item of want[list] || []) {
      if (!interpretation[list].some((value) => key(value) === key(item))) misses.push(item);
    }
  }
  for (const field of ["language", "yearFrom", "yearTo"]) {
    if (want[field] !== undefined && interpretation[field] !== want[field]) misses.push(`${field} ${want[field]}`);
  }
  if (shown.length === 0) misses.push("no results");
  return { pass: misses.length === 0, detail: misses.length ? `missing ${misses.join(", ")}` : "terms match" };
}

function describeAnswer(interpretation) {
  if (!interpretation) return "";
  const parts = [];
  if (interpretation.titles.length) parts.push(`titles ${interpretation.titles.map((t) => `${t.title}${t.year ? ` (${t.year})` : ""}`).join("; ")}`);
  if (interpretation.people.length) parts.push(`people ${interpretation.people.join("; ")}`);
  if (interpretation.genres.length) parts.push(`genres ${interpretation.genres.join("; ")}`);
  if (interpretation.keywords.length) parts.push(`keywords ${interpretation.keywords.join("; ")}`);
  if (interpretation.yearFrom || interpretation.yearTo) parts.push(`years ${interpretation.yearFrom ?? ""}-${interpretation.yearTo ?? ""}`);
  if (interpretation.language) parts.push(`language ${interpretation.language}`);
  return parts.join(" | ");
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

loadEnv();
if (!process.env.GROQ_API_KEY || !(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY)) {
  console.error("[smart-search-eval] Needs GROQ_API_KEY and TMDB_READ_ACCESS_TOKEN (try `npx vercel env pull .env.local`).");
  process.exit(2);
}

// Imported only once the environment is loaded, because the TMDB client reads
// its token when it is called and the providers read theirs when built.
const { discoverWithFallback, getModelProviders, interpretDescription, resolveTerms, verifyTitles } =
  await import("../../api/_lib/describedSearch.js");

const args = parseArgs(process.argv.slice(2));
const allCases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"));
const cases = allCases.filter((item) => (!args.group || item.group === args.group)
  && (!args.only || item.query.includes(args.only)));
const configs = parseConfigs(args.config);
const report = { startedAt: new Date().toISOString(), configs: [] };
let stopped = null;

for (const config of configs) {
  const providers = getModelProviders({
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: config.model,
    GROQ_REASONING_EFFORT: config.effort,
  });
  const provider = providers[0];
  console.log(`\n== ${config.label}: ${provider.model}, ${provider.extra.reasoning_effort} reasoning ==`);
  const results = [];

  for (const item of cases) {
    for (let run = 0; run < args.runs && !stopped; run += 1) {
      const call = { latencyMs: null, waits: 0, warnings: [] };
      // The app gives up at five seconds; this waits longer so a slow answer
      // is measured and scored, then counted as one the app would not show.
      // A rate limit is waited out rather than scored as a miss.
      const fetchImpl = async (url, options) => {
        for (;;) {
          const startedAt = Date.now();
          const response = await fetch(url, { ...options, signal: AbortSignal.timeout(MEASURE_TIMEOUT_MS) });
          if (response.status !== 429) {
            call.latencyMs = Date.now() - startedAt;
            return response;
          }
          const waitMs = (Number(response.headers.get("retry-after")) || 10) * 1000;
          if (waitMs > LONGEST_WAIT_MS) {
            stopped = `Groq asked for a ${Math.round(waitMs / 60000)} minute wait, which is its daily limit`;
            return response;
          }
          call.waits += 1;
          process.stdout.write(`   (rate limited, waiting ${seconds(waitMs)})\n`);
          await sleep(waitMs);
        }
      };
      const warn = console.warn;
      console.warn = (...parts) => call.warnings.push(parts.map(String).join(" "));
      let interpretation;
      try {
        interpretation = await interpretDescription(item.query, { providers, fetchImpl });
      } finally {
        console.warn = warn;
      }
      if (stopped) break;

      let shown = [];
      if (interpretation) {
        const [picks, { results: found }] = await Promise.all([
          verifyTitles(interpretation.titles),
          resolveTerms(interpretation).then((resolved) => discoverWithFallback(resolved)),
        ]);
        const pickIds = new Set(picks.map((movie) => movie.id));
        shown = [...picks, ...found.filter((movie) => !pickIds.has(movie.id))];
      }
      const outcome = score(item, interpretation, shown);
      const inTime = call.latencyMs !== null && call.latencyMs <= APP_TIMEOUT_MS;
      const result = {
        ...item,
        run: run + 1,
        ...outcome,
        inTime,
        latencyMs: call.latencyMs,
        answer: interpretation,
        shown: shown.slice(0, 5).map((movie) => `${movie.title} (${yearOf(movie) ?? "?"})`),
        warnings: call.warnings,
      };
      results.push(result);

      const mark = outcome.pass ? (inTime ? "✓" : "◷") : "✗";
      const latency = call.latencyMs === null ? "  -  " : seconds(call.latencyMs).padStart(5);
      console.log(`${mark} ${latency}  ${item.group.padEnd(16)} ${item.query} → ${outcome.detail}`);
      if (!outcome.pass) {
        console.log(`      read as: ${describeAnswer(interpretation) || call.warnings.join(" ") || "nothing"}`);
        if (shown.length) console.log(`      showed: ${result.shown.join(", ")}`);
      }
      if (args.delay) await sleep(args.delay);
    }
    if (stopped) break;
  }

  const latencies = results.map((r) => r.latencyMs).filter((ms) => ms !== null);
  const groups = [...new Set(results.map((r) => r.group))].map((group) => {
    const inGroup = results.filter((r) => r.group === group);
    return { group, passed: inGroup.filter((r) => r.pass && r.inTime).length, total: inGroup.length };
  });
  const summary = {
    label: config.label,
    model: provider.model,
    effort: provider.extra.reasoning_effort,
    passed: results.filter((r) => r.pass && r.inTime).length,
    passedIgnoringTime: results.filter((r) => r.pass).length,
    total: results.length,
    tooSlow: latencies.filter((ms) => ms > APP_TIMEOUT_MS).length,
    noAnswer: results.filter((r) => !r.answer).length,
    medianMs: percentile(latencies, 0.5),
    p90Ms: percentile(latencies, 0.9),
    groups,
  };
  report.configs.push({ ...summary, results });

  console.log(`\n${config.label}: ${summary.passed}/${summary.total} would show the answer`
    + ` (${summary.passedIgnoringTime} with no time limit).`
    + ` Median ${seconds(summary.medianMs)}, 90th percentile ${seconds(summary.p90Ms)},`
    + ` ${summary.tooSlow} over 5s, ${summary.noAnswer} with no answer.`);
  for (const { group, passed, total } of groups) console.log(`   ${group.padEnd(16)} ${passed}/${total}`);
  if (stopped) break;
}

if (stopped) console.log(`\nStopped early: ${stopped}.`);
mkdirSync(new URL("../../.smart-search-eval/", import.meta.url), { recursive: true });
const file = new URL(`../../.smart-search-eval/${report.startedAt.replace(/[:.]/g, "-")}.json`, import.meta.url);
writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nFull results: ${file.pathname}`);
