#!/usr/bin/env node
// Ships a commit that has been on staging to moviebowl.app.
//
// `main` deploys to staging and `release` to production, so releasing is moving
// `release` forward. What makes that worth a script is the order: production's
// migrations have to land before the code that needs them, and once they were
// merged in the wrong order and bowl creation went down. So this pushes pending
// migrations first, refuses to move `release` while one is still missing, and
// only then fast-forwards it.
//
//   npm run release              # release the head of origin/main
//   npm run release -- <commit>  # release an earlier commit of main
//
// It runs on the machine whose checkout is linked to the production Supabase
// project (`supabase link`), and asks before each step that changes anything.
// RELEASE_DB_URL=<connection string> uses that database instead of the linked
// project, which is how to rehearse a release against a scratch one.
// The checkout has to be clean, because migrations are pushed from the files of
// the commit being released, which means checking that commit out for a moment.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const REPO = resolve(import.meta.dirname, "..");
// Pinned so a release does not depend on whichever CLI happens to be installed,
// and so its JSON output stays the shape read below.
const SUPABASE = ["--yes", "supabase@2.119.0"];
const PRODUCTION_URL = "https://moviebowl.app";
const PASSING = new Set(["success", "skipped", "neutral"]);
const DEPLOY_WAIT_MS = 10 * 60 * 1000;

function git(...args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}

function gitOk(...args) {
  return spawnSync("git", args, { cwd: REPO, stdio: "ignore" }).status === 0;
}

// Thrown rather than exiting, so a failure partway through still puts the
// checkout back on the branch it started on.
class ReleaseStopped extends Error {}

function fail(message) {
  throw new ReleaseStopped(message);
}

// One reader for the whole run, paused between questions so that the Supabase
// CLI, which shares the terminal, can read a password in between. Input that
// ends early answers no.
const prompt = createInterface({ input: process.stdin, output: process.stdout });
let inputClosed = false;
prompt.on("close", () => {
  inputClosed = true;
});

async function confirm(question) {
  if (inputClosed) return false;
  const answer = await Promise.race([
    prompt.question(`${question} [y/N] `),
    new Promise((done) => prompt.once("close", () => done(""))),
  ]);
  prompt.pause();
  return /^y(es)?$/i.test(answer.trim());
}

function supabase(...args) {
  // stdin and stderr stay on the terminal, so a password prompt can be
  // answered; the JSON answer arrives alone on stdout.
  const result = spawnSync("npx", [...SUPABASE, ...args], {
    cwd: REPO,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  });
  if (result.status !== 0) fail(`supabase ${args.join(" ")} failed.`);
  const json = result.stdout.trim().split("\n").at(-1);
  try {
    return JSON.parse(json);
  } catch {
    fail(`Could not read the Supabase CLI's answer:\n${result.stdout}`);
  }
}

const DATABASE = process.env.RELEASE_DB_URL ? ["--db-url", process.env.RELEASE_DB_URL] : ["--linked"];

function pendingMigrations() {
  return supabase("db", "push", ...DATABASE, "--dry-run", "--output-format", "json");
}

function repoSlug() {
  const url = git("remote", "get-url", "origin");
  return url.match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1] ?? "scottmttmn/movie-bowl";
}

// The repository is public, so its check runs can be read without a token.
async function checkRuns(sha) {
  const response = await fetch(
    `https://api.github.com/repos/${repoSlug()}/commits/${sha}/check-runs?per_page=100`,
    { headers: { accept: "application/vnd.github+json" } },
  );
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const { check_runs: runs } = await response.json();
  return runs;
}

async function waitForDeploy(sha) {
  const buildId = sha.slice(0, 12);
  const deadline = Date.now() + DEPLOY_WAIT_MS;
  process.stdout.write(`Waiting for ${PRODUCTION_URL} to serve ${buildId}`);
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${PRODUCTION_URL}/version.json`, { cache: "no-store" });
      if (response.ok && (await response.json()).buildId === buildId) {
        console.log(`\nProduction is serving ${buildId}.`);
        return true;
      }
    } catch {
      // A failed poll mid-deploy says nothing yet; the deadline decides.
    }
    process.stdout.write(".");
    await new Promise((done) => setTimeout(done, 15_000));
  }
  console.log(`\nProduction is not serving ${buildId} after ten minutes. Check the deploy in Vercel.`);
  return false;
}

async function main() {
  if (git("status", "--porcelain")) {
    fail("The checkout has uncommitted changes. Commit or stash them first.");
  }
  const refFile = join(REPO, "supabase/.temp/project-ref");
  if (!process.env.RELEASE_DB_URL && !existsSync(refFile)) {
    fail("This checkout is not linked to a Supabase project. Run `supabase link --project-ref <production ref>`.");
  }
  const projectRef = process.env.RELEASE_DB_URL ? "RELEASE_DB_URL" : readFileSync(refFile, "utf8").trim();

  console.log("Fetching main, release and tags...");
  git("fetch", "--quiet", "--tags", "origin", "main");
  if (!gitOk("fetch", "--quiet", "origin", "release")) {
    fail("There is no release branch on origin yet. Create it at the commit production runs now.");
  }

  const target = git("rev-parse", "--verify", `${process.argv[2] ?? "origin/main"}^{commit}`);
  const released = git("rev-parse", "origin/release");
  if (target === released) {
    console.log(`release is already at ${target.slice(0, 12)}. Nothing to ship.`);
    return;
  }
  if (!gitOk("merge-base", "--is-ancestor", target, "origin/main")) {
    fail(`${target.slice(0, 12)} is not on main. Only commits that have been on staging can be released.`);
  }
  if (gitOk("merge-base", "--is-ancestor", target, released)) {
    fail(`${target.slice(0, 12)} is already released: release is at ${released.slice(0, 12)}.`);
  }
  if (!gitOk("merge-base", "--is-ancestor", released, target)) {
    fail("release has commits main does not, most likely a hotfix. Merge release into main first.");
  }

  console.log(`\nShipping ${target.slice(0, 12)} to ${PRODUCTION_URL}. Changes since the last release:\n`);
  console.log(git("log", "--oneline", "--no-merges", `${released}..${target}`));

  // CI on the commit itself, not on the pull requests that led to it: a merge
  // of two green branches can still be red.
  let runs = [];
  try {
    runs = await checkRuns(target);
  } catch (error) {
    console.log(`\nCould not read CI for this commit (${error.message}).`);
  }
  const notGreen = runs.filter((run) => run.status !== "completed" || !PASSING.has(run.conclusion));
  if (runs.length === 0 || notGreen.length > 0) {
    for (const run of notGreen) console.log(`  ${run.name}: ${run.conclusion ?? run.status}`);
    if (!(await confirm("\nCI on this commit is not all green. Release anyway?"))) return;
  } else {
    console.log(`\nCI is green on this commit (${runs.length} checks).`);
  }

  const original = git("rev-parse", "--abbrev-ref", "HEAD") === "HEAD"
    ? git("rev-parse", "HEAD")
    : git("rev-parse", "--abbrev-ref", "HEAD");
  git("switch", "--quiet", "--detach", target);
  try {
    const plan = pendingMigrations();
    if (plan.migrations?.length) {
      console.log(`\nMigrations not yet on Supabase project ${projectRef}:`);
      for (const name of plan.migrations) console.log(`  ${name}`);
      if (!(await confirm(`Push them to ${projectRef} now?`))) return;
      const push = spawnSync("npx", [...SUPABASE, "db", "push", ...DATABASE, "--yes"], {
        cwd: REPO,
        stdio: "inherit",
      });
      if (push.status !== 0) fail("The migration push failed. release has not moved.");
    } else {
      console.log(`\nSupabase project ${projectRef} already has every migration in this commit.`);
    }
    // Asked again rather than trusted from the push's exit code, because this
    // is the one condition the whole script exists to hold.
    if (!pendingMigrations().upToDate) {
      fail("Supabase still reports pending migrations. release has not moved.");
    }
  } finally {
    git("switch", "--quiet", ...(original.length === 40 ? ["--detach"] : []), original);
  }

  if (!(await confirm(`\nMove release to ${target.slice(0, 12)} and ship it?`))) return;

  // No --force: git refuses anything but a fast-forward, which is the point.
  git("push", "--quiet", "origin", `${target}:refs/heads/release`);
  const day = new Date().toLocaleDateString("en-CA");
  let tag = `release-${day}`;
  for (let n = 2; gitOk("rev-parse", "--verify", "--quiet", `refs/tags/${tag}`); n += 1) {
    tag = `release-${day}-${n}`;
  }
  git("tag", tag, target);
  git("push", "--quiet", "origin", tag);
  console.log(`release is at ${target.slice(0, 12)}, tagged ${tag}.\n`);

  await waitForDeploy(target);
}

try {
  await main();
} catch (error) {
  if (!(error instanceof ReleaseStopped)) throw error;
  console.error(`\n${error.message}`);
  process.exitCode = 1;
} finally {
  prompt.close();
}
