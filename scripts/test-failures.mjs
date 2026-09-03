#!/usr/bin/env node
// Names the tests that failed in the most recent `npm run test:run`.
//
// The suite prints a lot of expected console.error from tests that exercise
// failure paths, so a real failure does not stand out in scrollback -- and a
// piped run can drop the one line that names it. The JSON report is written on
// every run, so this answers the question after the fact, and after a flake
// that will not reproduce.
import { readFileSync } from "node:fs";
import { relative } from "node:path";

const REPORT = ".vitest/last-run.json";

let report;
try {
  report = JSON.parse(readFileSync(REPORT, "utf8"));
} catch (error) {
  const reason = error.code === "ENOENT" ? "No report yet" : `Could not read ${REPORT}`;
  console.error(`${reason}. Run \`npm run test:run\` first.`);
  process.exit(2);
}

const failures = [];
for (const file of report.testResults || []) {
  for (const assertion of file.assertionResults || []) {
    if (assertion.status !== "failed") continue;
    failures.push({
      file: relative(process.cwd(), file.name),
      name: assertion.fullName,
      // Only the first line: the rest is a stack through node_modules.
      reason: (assertion.failureMessages || [])[0]?.split("\n")[0]?.trim() || "",
    });
  }
}

const ranAt = report.startTime ? new Date(report.startTime).toLocaleString() : "unknown time";
const { numPassedTests = 0, numFailedTests = 0, numTotalTests = 0 } = report;
console.log(`Last run at ${ranAt}: ${numPassedTests}/${numTotalTests} passed, ${numFailedTests} failed.`);

if (failures.length === 0) {
  // A suite that crashes before running can report zero failures and still not
  // have succeeded, so trust `success` over the failure count alone.
  if (report.success === false) {
    console.error("\nThe run did not succeed but named no failing test — check the run output for a load or config error.");
    process.exit(1);
  }
  process.exit(0);
}

console.log("");
for (const failure of failures) {
  console.log(`✗ ${failure.name}`);
  console.log(`  ${failure.file}`);
  if (failure.reason) console.log(`  ${failure.reason}`);
}
process.exit(1);
