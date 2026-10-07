// Makes one real call to each outside service the app depends on and says
// which answered. It reads nothing private and writes nothing.
//
//   npm run check:apis
//   npm run check:apis -- --summary out.md   # also write a Markdown table
//   npm run check:apis -- --weekly           # also the weekly checks
//
// Takes TMDB_READ_ACCESS_TOKEN, GROQ_API_KEY, CLOUDFLARE_ACCOUNT_ID,
// CLOUDFLARE_AI_TOKEN, RESEND_API_KEY, STAGING_SUPABASE_URL,
// STAGING_SUPABASE_ANON_KEY and WATCHMODE_API_KEY from the environment, .env
// or .env.local. A
// missing one fails its check. Scheduled daily from the private
// movie-bowl-issues repository, which holds the keys.
import { readFileSync, writeFileSync } from "node:fs";
import { formatSummary, runChecks } from "./checks.mjs";

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

const summaryIndex = process.argv.indexOf("--summary");
const summaryPath = summaryIndex > -1 ? process.argv[summaryIndex + 1] : null;

const results = await runChecks(process.env, fetch, { weekly: process.argv.includes("--weekly") });
for (const result of results) console.log(`${result.ok ? "✓" : "✗"} ${result.name}: ${result.detail}`);
if (summaryPath) writeFileSync(summaryPath, formatSummary(results));
process.exit(results.every((result) => result.ok) ? 0 : 1);
