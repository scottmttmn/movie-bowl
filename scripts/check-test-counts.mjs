#!/usr/bin/env node
// Holds the counts in CLAUDE.md to what the suites actually ran.
//
// CLAUDE.md calls those numbers a tripwire, but nothing was measuring them, so
// they could only catch someone who was already counting. That is the wrong way
// round for the failure they exist to catch: a deleted test does not turn a
// suite red, it makes the number smaller and stays green, and a suite that
// cannot load a file reports every test it did collect as passing. Comparing
// the sentence to the run turns "refresh them in the same commit" from a
// request into something that has to happen before a merge.
//
//   node scripts/check-test-counts.mjs vitest       # after npm run test:run
//   node scripts/check-test-counts.mjs playwright   # after npm run test:e2e
//   node scripts/check-test-counts.mjs pgtap        # after ./scripts/pgtap.sh
//   node scripts/check-test-counts.mjs              # whichever reports exist
import { readFileSync } from "node:fs";

const SOURCE = "CLAUDE.md";
const VITEST_REPORT = ".vitest/last-run.json";
const PLAYWRIGHT_REPORT = ".playwright/last-run.json";
const PGTAP_REPORT = ".pgtap/last-run.json";

// The one sentence in CLAUDE.md that states all four numbers. Matched loosely
// across whitespace because it is prose and wraps wherever the paragraph does.
const EXPECTED_PATTERN =
  /(\d+)\s+test files\s*\/\s*(\d+)\s+tests,\s*(\d+)\s+Playwright tests with\s+(\d+)\s+skipped/;

// The database suites are stated in their own sentence, because they are run by
// their own command and were for a long time the one gate a machine could not
// run at all.
const EXPECTED_PGTAP_PATTERN = /(\d+)\s+suites\s*\/\s*(\d+)\s+assertions/;

function readReport(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    console.error(`Could not read ${path}: ${error.message}`);
    process.exit(2);
  }
}

function readExpected() {
  let text;
  try {
    text = readFileSync(SOURCE, "utf8");
  } catch {
    console.error(`Could not read ${SOURCE}.`);
    process.exit(2);
  }

  const match = text.match(EXPECTED_PATTERN);
  if (!match) {
    // Rewording the sentence is allowed; dropping the numbers is not, because
    // then nothing states what a clean checkout looks like.
    console.error(
      `${SOURCE} no longer states the expected counts in a form this can read.\n` +
        "Expected a sentence like: 148 test files / 1238 tests, 68 Playwright tests with 7 skipped"
    );
    process.exit(2);
  }

  const pgtapMatch = text.match(EXPECTED_PGTAP_PATTERN);
  if (!pgtapMatch) {
    console.error(
      `${SOURCE} no longer states the expected database counts in a form this can read.\n` +
        "Expected a sentence like: A clean run is 23 suites / 600 assertions"
    );
    process.exit(2);
  }

  const [, files, tests, e2e, skipped] = match.map(Number);
  const [, pgtapFiles, pgtapAssertions] = pgtapMatch.map(Number);
  return { files, tests, e2e, skipped, pgtapFiles, pgtapAssertions };
}

function compare(label, differences) {
  const wrong = differences.filter((d) => d.actual !== d.expected);
  if (wrong.length === 0) {
    const summary = differences.map((d) => `${d.actual} ${d.what}`).join(", ");
    console.log(`✓ ${label}: ${summary}, as ${SOURCE} says.`);
    return true;
  }

  for (const d of wrong) {
    const direction = d.actual > d.expected ? "more" : "fewer";
    console.error(
      `✗ ${label}: ${d.actual} ${d.what}, but ${SOURCE} says ${d.expected} — ${direction} than expected.`
    );
  }
  return false;
}

const MODES = ["vitest", "playwright", "pgtap"];
const mode = process.argv[2];
if (mode && !MODES.includes(mode)) {
  console.error(`Unknown mode "${mode}". Use ${MODES.join(", ")}, or no argument.`);
  process.exit(2);
}
const wants = (name) => !mode || mode === name;

const expected = readExpected();
let checked = 0;
let ok = true;

if (wants("vitest")) {
  const report = readReport(VITEST_REPORT);
  if (!report && mode === "vitest") {
    console.error(`No report at ${VITEST_REPORT}. Run \`npm run test:run\` first.`);
    process.exit(2);
  }
  if (report) {
    if (report.success === false) {
      // A red run collects whatever it managed to load, so its counts describe
      // the failure rather than the suite. `npm run test:failures` is the tool
      // for that; there is nothing for this one to say.
      console.error(`The last \`npm run test:run\` did not succeed, so its counts mean nothing yet.`);
      process.exit(2);
    }
    checked += 1;
    ok =
      compare("Vitest", [
        { what: "test files", actual: report.testResults?.length ?? 0, expected: expected.files },
        { what: "tests", actual: report.numTotalTests ?? 0, expected: expected.tests },
      ]) && ok;
  }
}

if (wants("playwright")) {
  const report = readReport(PLAYWRIGHT_REPORT);
  if (!report && mode === "playwright") {
    console.error(`No report at ${PLAYWRIGHT_REPORT}. Run \`npm run test:e2e\` first.`);
    process.exit(2);
  }
  if (report) {
    const stats = report.stats || {};
    // Playwright counts each outcome separately and never states a total.
    const total =
      (stats.expected || 0) + (stats.skipped || 0) + (stats.unexpected || 0) + (stats.flaky || 0);
    checked += 1;
    ok =
      compare("Playwright", [
        { what: "tests", actual: total, expected: expected.e2e },
        { what: "skipped", actual: stats.skipped || 0, expected: expected.skipped },
      ]) && ok;
  }
}

if (wants("pgtap")) {
  const report = readReport(PGTAP_REPORT);
  if (!report && mode === "pgtap") {
    console.error(`No report at ${PGTAP_REPORT}. Run \`./scripts/pgtap.sh\` first.`);
    process.exit(2);
  }
  if (report) {
    if (report.success === false) {
      console.error(`The last \`./scripts/pgtap.sh\` did not succeed, so its counts mean nothing yet.`);
      process.exit(2);
    }
    checked += 1;
    ok =
      compare("pgTAP", [
        { what: "suites", actual: report.files ?? 0, expected: expected.pgtapFiles },
        { what: "assertions", actual: report.tests ?? 0, expected: expected.pgtapAssertions },
      ]) && ok;
  }
}

if (checked === 0) {
  console.error(
    "No test reports to check. Run `npm run test:run`, `npm run test:e2e` or `./scripts/pgtap.sh` first."
  );
  process.exit(2);
}

if (!ok) {
  console.error(
    `\nIf the change is deliberate, update the counts in ${SOURCE} in the same commit. ` +
      "If it is not, a test was lost."
  );
  process.exit(1);
}
