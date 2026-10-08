#!/usr/bin/env node
// Ships a commit that has been on staging to moviebowl.app (release.mjs says
// how, and why in that order).
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
//
// Exits 1 when it stops, and also when release moved but production was not
// seen serving the new build: that is "deployment unverified", not a failure
// to undo.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { ReleaseStopped, release } from "./release.mjs";

const REPO = resolve(import.meta.dirname, "../..");
// Pinned so a release does not depend on whichever CLI happens to be installed,
// and so its JSON output stays the shape release.mjs reads.
const SUPABASE = ["--yes", "supabase@2.119.0"];

function git(...args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}

function gitOk(...args) {
  return spawnSync("git", args, { cwd: REPO, stdio: "ignore" }).status === 0;
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
  if (result.status !== 0) throw new ReleaseStopped(`supabase ${args.join(" ")} failed.`);
  const json = result.stdout.trim().split("\n").at(-1);
  try {
    return JSON.parse(json);
  } catch {
    throw new ReleaseStopped(`Could not read the Supabase CLI's answer:\n${result.stdout}`);
  }
}

function pushMigrations(database) {
  return spawnSync("npx", [...SUPABASE, "db", "push", ...database, "--yes"], { cwd: REPO, stdio: "inherit" }).status === 0;
}

function linkedProjectRef() {
  const refFile = join(REPO, "supabase/.temp/project-ref");
  return existsSync(refFile) ? readFileSync(refFile, "utf8").trim() : null;
}

try {
  process.exitCode = await release({
    git,
    gitOk,
    supabase,
    pushMigrations,
    linkedProjectRef,
    confirm,
    fetch,
    now: Date.now,
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    log: console.log,
    write: (text) => process.stdout.write(text),
    env: process.env,
    target: process.argv[2],
  });
} catch (error) {
  if (!(error instanceof ReleaseStopped)) throw error;
  console.error(`\n${error.message}`);
  process.exitCode = 1;
} finally {
  prompt.close();
}
