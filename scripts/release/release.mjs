// The steps of `npm run release`, with everything that reaches outside the
// process passed in, so the order this exists to hold can be tested without a
// repository, a database or a network. run.mjs supplies the real ones.
//
// `main` deploys to staging and `release` to production, so releasing is moving
// `release` forward. What makes that worth a script is the order: production's
// migrations have to land before the code that needs them, and once they were
// merged in the wrong order and bowl creation went down. So this pushes pending
// migrations first, refuses to move `release` while one is still missing, and
// only then fast-forwards it.

export const PRODUCTION_URL = "https://moviebowl.app";
const PASSING = new Set(["success", "skipped", "neutral"]);
export const DEPLOY_WAIT_MS = 10 * 60 * 1000;
export const DEPLOY_POLL_MS = 15_000;

// Thrown rather than exiting, so a failure partway through still puts the
// checkout back on the branch it started on.
export class ReleaseStopped extends Error {}

function fail(message) {
  throw new ReleaseStopped(message);
}

export function repoSlug(remoteUrl) {
  return remoteUrl.match(/github\.com[:/](.+?)(?:\.git)?$/)?.[1] ?? "scottmttmn/movie-bowl";
}

// The repository is public, so its check runs can be read without a token.
async function checkRuns({ fetch, git }, sha) {
  const response = await fetch(
    `https://api.github.com/repos/${repoSlug(git("remote", "get-url", "origin"))}/commits/${sha}/check-runs?per_page=100`,
    { headers: { accept: "application/vnd.github+json" } },
  );
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const { check_runs: runs } = await response.json();
  return runs;
}

export async function waitForDeploy({ fetch, now, sleep, log, write }, sha) {
  const buildId = sha.slice(0, 12);
  const deadline = now() + DEPLOY_WAIT_MS;
  write(`Waiting for ${PRODUCTION_URL} to serve ${buildId}`);
  while (now() < deadline) {
    try {
      const response = await fetch(`${PRODUCTION_URL}/version.json`, { cache: "no-store" });
      if (response.ok && (await response.json()).buildId === buildId) {
        log(`\nProduction is serving ${buildId}.`);
        return true;
      }
    } catch {
      // A failed poll mid-deploy says nothing yet; the deadline decides.
    }
    write(".");
    await sleep(DEPLOY_POLL_MS);
  }
  return false;
}

// Resolves to the process's exit code. `confirm` answering no is a choice, not
// a failure, so it exits 0 with nothing changed after it.
export async function release(deps) {
  const { git, gitOk, supabase, pushMigrations, confirm, log, env, target: requested, linkedProjectRef } = deps;
  if (git("status", "--porcelain")) {
    fail("The checkout has uncommitted changes. Commit or stash them first.");
  }
  const projectRef = env.RELEASE_DB_URL ? "RELEASE_DB_URL" : linkedProjectRef();
  if (!projectRef) {
    fail("This checkout is not linked to a Supabase project. Run `supabase link --project-ref <production ref>`.");
  }
  const database = env.RELEASE_DB_URL ? ["--db-url", env.RELEASE_DB_URL] : ["--linked"];
  const pendingMigrations = () => supabase("db", "push", ...database, "--dry-run", "--output-format", "json");

  log("Fetching main, release and tags...");
  git("fetch", "--quiet", "--tags", "origin", "main");
  if (!gitOk("fetch", "--quiet", "origin", "release")) {
    fail("There is no release branch on origin yet. Create it at the commit production runs now.");
  }

  const target = git("rev-parse", "--verify", `${requested ?? "origin/main"}^{commit}`);
  const released = git("rev-parse", "origin/release");
  if (target === released) {
    log(`release is already at ${target.slice(0, 12)}. Nothing to ship.`);
    return 0;
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

  log(`\nShipping ${target.slice(0, 12)} to ${PRODUCTION_URL}. Changes since the last release:\n`);
  log(git("log", "--oneline", "--no-merges", `${released}..${target}`));

  // CI on the commit itself, not on the pull requests that led to it: a merge
  // of two green branches can still be red.
  let runs = [];
  try {
    runs = await checkRuns(deps, target);
  } catch (error) {
    log(`\nCould not read CI for this commit (${error.message}).`);
  }
  const notGreen = runs.filter((run) => run.status !== "completed" || !PASSING.has(run.conclusion));
  if (runs.length === 0 || notGreen.length > 0) {
    for (const run of notGreen) log(`  ${run.name}: ${run.conclusion ?? run.status}`);
    if (!(await confirm("\nCI on this commit is not all green. Release anyway?"))) return 0;
  } else {
    log(`\nCI is green on this commit (${runs.length} checks).`);
  }

  // Migrations are pushed from the files of the commit being released, so it
  // is checked out for a moment, which is why the checkout has to be clean.
  const original = git("rev-parse", "--abbrev-ref", "HEAD") === "HEAD"
    ? git("rev-parse", "HEAD")
    : git("rev-parse", "--abbrev-ref", "HEAD");
  git("switch", "--quiet", "--detach", target);
  try {
    const plan = pendingMigrations();
    if (plan.migrations?.length) {
      log(`\nMigrations not yet on Supabase project ${projectRef}:`);
      for (const name of plan.migrations) log(`  ${name}`);
      if (!(await confirm(`Push them to ${projectRef} now?`))) return 0;
      if (!pushMigrations(database)) fail("The migration push failed. release has not moved.");
    } else {
      log(`\nSupabase project ${projectRef} already has every migration in this commit.`);
    }
    // Asked again rather than trusted from the push's exit code, because this
    // is the one condition the whole script exists to hold.
    if (!pendingMigrations().upToDate) {
      fail("Supabase still reports pending migrations. release has not moved.");
    }
  } finally {
    git("switch", "--quiet", ...(original.length === 40 ? ["--detach"] : []), original);
  }

  if (!(await confirm(`\nMove release to ${target.slice(0, 12)} and ship it?`))) return 0;

  // No --force: git refuses anything but a fast-forward, which is the point.
  git("push", "--quiet", "origin", `${target}:refs/heads/release`);
  const day = new Date(deps.now()).toLocaleDateString("en-CA");
  let tag = `release-${day}`;
  for (let n = 2; gitOk("rev-parse", "--verify", "--quiet", `refs/tags/${tag}`); n += 1) {
    tag = `release-${day}-${n}`;
  }
  git("tag", tag, target);
  git("push", "--quiet", "origin", tag);
  log(`release is at ${target.slice(0, 12)}, tagged ${tag}.\n`);

  if (await waitForDeploy(deps, target)) return 0;
  // Not rolled back: Vercel may still finish the build, and a release that
  // lands late is not a broken one. But nobody has seen it serve, so the run
  // must not read as a success to whoever, or whatever, started it.
  log(
    `\nDeployment unverified: ${PRODUCTION_URL} is not serving ${target.slice(0, 12)} after ten minutes.` +
      ` release has moved and is tagged ${tag}. Check the deploy in Vercel.`,
  );
  return 1;
}
