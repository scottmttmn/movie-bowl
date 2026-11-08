// Runs the help panel's test set: questions with the guide topic each should
// get, or null for questions the app has no answer to (a bug, an idea, a
// feature it lacks) -- the cases where a confident wrong answer would be worse
// than "No answer for that." Each goes through the same model call the help
// action makes.
//
//   npm run eval:help
//   npm run eval:help -- --only restaurant
//
// Needs GROQ_API_KEY (or the Cloudflare pair), from the environment, .env or
// .env.local. Each question spends about 1,200 tokens of the free quota, and
// the run paces itself to fit the per-minute limit: about six minutes.
import { readFileSync } from "node:fs";
import { pickHelpTopic } from "../../api/_lib/helpAnswer.js";

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

loadEnv();
if (!process.env.GROQ_API_KEY && !process.env.CLOUDFLARE_AI_TOKEN) {
  console.error("Set GROQ_API_KEY (or CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN) first.");
  process.exit(2);
}
const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex > 0 ? process.argv[onlyIndex + 1]?.toLowerCase() : null;
const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"))
  .filter((entry) => !only || entry.q.toLowerCase().includes(only));

let passed = 0;
let wrongTopic = 0;
for (const entry of cases) {
  const reply = await pickHelpTopic(entry.q);
  const got = reply ? reply.topic : "(no model answered)";
  const ok = reply && got === entry.topic;
  if (ok) passed += 1;
  // A topic where none belongs, or the wrong one, sends someone somewhere
  // unhelpful; a null where a topic belongs only offers feedback.
  else if (reply && got !== null) wrongTopic += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${entry.q}\n      expected ${entry.topic ?? "null"}, got ${got ?? "null"}`);
  // Each question carries the whole guide, about 1,200 tokens, and Groq's
  // free tier allows 8,000 a minute: faster than this and the later
  // questions fall through to Cloudflare or go unanswered, which scores the
  // rate limit rather than the guide.
  await sleep(9000);
}
console.log(`\n${passed}/${cases.length} correct; ${wrongTopic} pointed somewhere wrong.`);
process.exit(passed === cases.length ? 0 : 1);
