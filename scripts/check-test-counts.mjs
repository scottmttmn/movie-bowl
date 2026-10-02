#!/usr/bin/env node
// Checks that the last run of a suite still has every test the base commit had.
//
// A lost test does not turn a suite red: the number simply gets smaller and the
// run stays green, and a suite that cannot load a file reports every test it did
// collect as passing. So something has to remember what the suite used to hold.
// That used to be a sentence in CLAUDE.md stating each total, which every change
// adding a test had to edit -- so any two branches open at once collided on that
// one line, and a merge from GitHub's button quietly kept main's number. The
// commit you branched from already knows its own tests, so this asks it instead.
//
// Vitest and Playwright are compared file by file and test by test, which is
// cheap because both can list a suite without running it. A test renamed inside
// its file is fine; a file with fewer tests than it had, or a file that is gone,
// fails. pgTAP cannot list without a database, so the base's suites are run and
// compared by their totals; each suite's own plan() already holds its count.
//
//   node scripts/check-test-counts.mjs vitest       # after npm run test:run
//   node scripts/check-test-counts.mjs playwright   # after npm run test:e2e
//   node scripts/check-test-counts.mjs pgtap        # after ./scripts/pgtap.sh
//   node scripts/check-test-counts.mjs              # whichever reports exist
//   ... --base <ref>    compare with <ref> rather than the merge base with origin/main
//
// When tests are meant to go, say so in a commit on the branch with a line like
//   Tests-removed: the old radio grid is gone, and the dropdown's tests replace it
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..");
const VITEST_REPORT = ".vitest/last-run.json";
const PLAYWRIGHT_REPORT = ".playwright/last-run.json";
const PGTAP_REPORT = ".pgtap/last-run.json";
const ACKNOWLEDGEMENT = /^[\s*-]*Tests-removed:\s*\S/im;
const MAX_NAMES_PER_FILE = 5;

function fail(message) {
  console.error(message);
  process.exit(2);
}

function git(...args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    fail(`Could not read ${path}: ${error.message}`);
  }
}

function parseArgs(argv) {
  const modes = ["vitest", "playwright", "pgtap"];
  let mode = null;
  let base = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--base") base = argv[++i];
    else if (argv[i].startsWith("--base=")) base = argv[i].slice("--base=".length);
    else if (modes.includes(argv[i]) && !mode) mode = argv[i];
    else fail(`Unknown argument "${argv[i]}". Use ${modes.join(", ")}, or none, and optionally --base <ref>.`);
  }
  if (base === "") fail("--base needs a ref.");
  return { mode, base };
}

// The commit the branch grew from, not main's tip: a branch cut a week ago has
// not lost the tests main gained since, it has simply never had them.
function resolveBase(ref) {
  try {
    if (ref) return git("rev-parse", "--verify", `${ref}^{commit}`);
    for (const upstream of ["origin/main", "main"]) {
      try {
        return git("merge-base", "HEAD", upstream);
      } catch {
        // Try the next name; a fresh clone may only have one of them.
      }
    }
  } catch {
    fail(`Could not find the commit "${ref}". Fetch it first, or pass another --base.`);
  }
  fail("Could not find origin/main or main to compare with. Fetch it, or pass --base <ref>.");
}

function isAcknowledged(base) {
  return ACKNOWLEDGEMENT.test(git("log", "--format=%B", `${base}..HEAD`));
}

// A detached checkout of the base beside this one, sharing node_modules so that
// listing it costs a collection pass rather than an install. A failure inside is
// reported only once the checkout is gone, since exiting skips `finally`.
function withBaseCheckout(base, what, work) {
  const dir = mkdtempSync(join(tmpdir(), "movie-bowl-base-"));
  rmSync(dir, { recursive: true, force: true });
  git("worktree", "add", "--detach", "--quiet", dir, base);
  let result = null;
  let failed = false;
  try {
    if (existsSync(join(REPO, "node_modules"))) {
      symlinkSync(join(REPO, "node_modules"), join(dir, "node_modules"), "dir");
    }
    result = work(dir);
  } catch {
    failed = true;
  } finally {
    try {
      git("worktree", "remove", "--force", dir);
    } catch {
      rmSync(dir, { recursive: true, force: true });
      git("worktree", "prune");
    }
  }
  if (failed) fail(`Could not ${what} on ${base.slice(0, 7)} to compare with (see above).`);
  return result;
}

function run(command, args, cwd, env = {}) {
  execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "ignore", "inherit"],
  });
}

function tally(keys) {
  const counts = new Map();
  for (const { file, name } of keys) {
    const fileCounts = counts.get(file) || new Map();
    fileCounts.set(name, (fileCounts.get(name) || 0) + 1);
    counts.set(file, fileCounts);
  }
  return counts;
}

// Per file, how many tests the base had and how many of its names are missing
// now. A file is only short when its total fell: a renamed test leaves a name
// missing but the count whole, which is an edit rather than a loss.
function findLosses(baseKeys, headKeys) {
  const base = tally(baseKeys);
  const head = tally(headKeys);
  const losses = [];
  for (const [file, baseNames] of base) {
    const headNames = head.get(file) || new Map();
    const baseTotal = [...baseNames.values()].reduce((sum, n) => sum + n, 0);
    const headTotal = [...headNames.values()].reduce((sum, n) => sum + n, 0);
    if (headTotal >= baseTotal) continue;
    const missing = [];
    for (const [name, n] of baseNames) {
      for (let i = headNames.get(name) || 0; i < n; i += 1) missing.push(name);
    }
    losses.push({ file, baseTotal, headTotal, missing });
  }
  return losses;
}

function report(label, base, baseTotal, headTotal, losses) {
  const short = base.slice(0, 7);
  if (losses.length === 0) {
    console.log(`✓ ${label}: ${headTotal} tests, none lost against ${short} (which had ${baseTotal}).`);
    return true;
  }

  const acknowledged = isAcknowledged(base);
  const mark = acknowledged ? "!" : "✗";
  for (const loss of losses) {
    const where = loss.headTotal === 0 ? "is gone" : `has ${loss.headTotal}`;
    console.error(`${mark} ${label}: ${loss.file} had ${loss.baseTotal} tests at ${short} and now ${where}.`);
    for (const name of loss.missing.slice(0, MAX_NAMES_PER_FILE)) console.error(`    - ${name}`);
    if (loss.missing.length > MAX_NAMES_PER_FILE) {
      console.error(`    … and ${loss.missing.length - MAX_NAMES_PER_FILE} more`);
    }
  }
  if (acknowledged) {
    console.log(`✓ ${label}: the removals above are acknowledged by a Tests-removed: line on this branch.`);
    return true;
  }
  return false;
}

function headReport(path, command) {
  const data = readJson(join(REPO, path));
  if (!data) return null;
  if (data.success === false) {
    // A red run collects whatever it managed to load, so its counts describe
    // the failure rather than the suite.
    fail(`The last \`${command}\` did not succeed, so its counts mean nothing yet.`);
  }
  return data;
}

function checkVitest(base) {
  const head = headReport(VITEST_REPORT, "npm run test:run");
  if (!head) return null;
  const headKeys = (head.testResults || []).flatMap((file) =>
    (file.assertionResults || []).map((test) => ({
      file: relative(REPO, file.name),
      name: [...(test.ancestorTitles || []), test.title].join(" > "),
    }))
  );

  const baseKeys = withBaseCheckout(base, "list the Vitest suite", (dir) => {
    const out = join(dir, ".vitest-base-list.json");
    run(process.execPath, [join(dir, "node_modules/vitest/vitest.mjs"), "list", `--json=${out}`], dir);
    return readJson(out).map((test) => ({ file: relative(dir, test.file), name: test.name }));
  });

  return report("Vitest", base, baseKeys.length, headKeys.length, findLosses(baseKeys, headKeys));
}

// Playwright's JSON nests describe blocks as suites, and lists each test once
// per project, which is how it counts them too.
function playwrightKeys(data) {
  const keys = [];
  const walk = (suite, titles) => {
    const path = suite.title ? [...titles, suite.title] : titles;
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        keys.push({
          file: spec.file,
          name: `${[...path.slice(1), spec.title].join(" > ")} [${test.projectName}]`,
        });
      }
    }
    for (const child of suite.suites || []) walk(child, path);
  };
  for (const suite of data.suites || []) walk(suite, []);
  return keys;
}

function checkPlaywright(base) {
  const head = headReport(PLAYWRIGHT_REPORT, "npm run test:e2e");
  if (!head) return null;
  const headKeys = playwrightKeys(head);

  const baseKeys = withBaseCheckout(base, "list the Playwright suite", (dir) => {
    const listing = execFileSync(
      process.execPath,
      [join(dir, "node_modules/@playwright/test/cli.js"), "test", "--list", "--reporter=json"],
      { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] }
    );
    return playwrightKeys(JSON.parse(listing));
  });

  return report("Playwright", base, baseKeys.length, headKeys.length, findLosses(baseKeys, headKeys));
}

function checkPgtap(base) {
  const head = headReport(PGTAP_REPORT, "./scripts/pgtap.sh");
  if (!head) return null;

  const baseRun = withBaseCheckout(base, "run the pgTAP suites", (dir) => {
    run("bash", [join(dir, "scripts/pgtap.sh")], dir);
    return readJson(join(dir, PGTAP_REPORT));
  });

  const short = base.slice(0, 7);
  const lostSuites = head.files < baseRun.files;
  const lostAssertions = head.tests < baseRun.tests;
  if (!lostSuites && !lostAssertions) {
    console.log(
      `✓ pgTAP: ${head.files} suites / ${head.tests} assertions, none lost against ${short} ` +
        `(which had ${baseRun.files} / ${baseRun.tests}).`
    );
    return true;
  }
  const acknowledged = isAcknowledged(base);
  console.error(
    `${acknowledged ? "!" : "✗"} pgTAP: ${head.files} suites / ${head.tests} assertions, ` +
      `but ${short} had ${baseRun.files} / ${baseRun.tests}.`
  );
  if (acknowledged) {
    console.log("✓ pgTAP: acknowledged by a Tests-removed: line on this branch.");
    return true;
  }
  return false;
}

const { mode, base: baseRef } = parseArgs(process.argv.slice(2));
const base = resolveBase(baseRef);
const checks = { vitest: checkVitest, playwright: checkPlaywright, pgtap: checkPgtap };
const commands = { vitest: "npm run test:run", playwright: "npm run test:e2e", pgtap: "./scripts/pgtap.sh" };

let checked = 0;
let ok = true;
for (const [name, check] of Object.entries(checks)) {
  if (mode && mode !== name) continue;
  const result = check(base);
  if (result === null) {
    if (mode) fail(`No report from the last run. Run \`${commands[name]}\` first.`);
    continue;
  }
  checked += 1;
  ok = result && ok;
}

if (checked === 0) {
  fail("No test reports to check. Run `npm run test:run`, `npm run test:e2e` or `./scripts/pgtap.sh` first.");
}

if (!ok) {
  console.error(
    "\nIf the removal is deliberate, commit a line like `Tests-removed: <why>` on this branch. " +
      "If it is not, a test was lost -- or the last run covered only some files, which counts the rest as gone."
  );
  process.exit(1);
}
