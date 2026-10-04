#!/usr/bin/env node
// Checks that a deployed Movie Bowl is the build it should be and answers.
//
//   node scripts/check-deploy.mjs <base url> <commit>
//
// Three things, none of which sign in or write anything: /version.json names
// the commit (waiting for it, because a deploy finishes before its domain moves
// over), the page itself loads, and a TMDB search through /api/tmdb answers --
// the one call that needs a server secret and a live outside service, so it is
// what a missing environment variable breaks first. Run after every production
// deploy and before the staging smoke suite.
const [baseArg, commit] = process.argv.slice(2);
if (!baseArg || !commit) {
  console.error("Usage: node scripts/check-deploy.mjs <base url> <commit>");
  process.exit(2);
}
const base = baseArg.replace(/\/$/, "");
const buildId = commit.slice(0, 12);
const WAIT_MS = 10 * 60 * 1000;

async function servedBuild() {
  try {
    const response = await fetch(`${base}/version.json`, { cache: "no-store" });
    return response.ok ? (await response.json()).buildId : `HTTP ${response.status}`;
  } catch (error) {
    return error.message;
  }
}

const failures = [];
const deadline = Date.now() + WAIT_MS;
let served = await servedBuild();
while (served !== buildId && Date.now() < deadline) {
  await new Promise((done) => setTimeout(done, 15_000));
  served = await servedBuild();
}
if (served === buildId) {
  console.log(`${base} is serving ${buildId}.`);
} else {
  failures.push(`${base}/version.json still says ${served} after ten minutes, not ${buildId}.`);
}

try {
  const response = await fetch(`${base}/`, { cache: "no-store" });
  const html = await response.text();
  if (!response.ok || !html.includes('id="root"')) {
    failures.push(`The page answered ${response.status} without the app's root element.`);
  } else {
    console.log("The page loads.");
  }
} catch (error) {
  failures.push(`The page did not load: ${error.message}`);
}

try {
  const response = await fetch(`${base}/api/tmdb/search?query=Paddington`, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.results?.length) {
    failures.push(`TMDB search answered ${response.status} with ${body.results?.length ?? "no"} results: ${body.error ?? ""}`);
  } else {
    console.log(`TMDB search answers (${body.results.length} results).`);
  }
} catch (error) {
  failures.push(`TMDB search failed: ${error.message}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`::error::${failure}`);
  process.exit(1);
}
