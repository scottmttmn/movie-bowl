import { describe, expect, it } from "vitest";
import { DEPLOY_WAIT_MS, PRODUCTION_URL, ReleaseStopped, release, repoSlug } from "../release.mjs";

const TARGET = "a".repeat(40);
const RELEASED = "b".repeat(40);
const BUILD_ID = TARGET.slice(0, 12);

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// A release with nothing real behind it: git answers from a table and records
// every call, Supabase answers from a queue of dry-run plans, and the clock
// only moves when the script sleeps.
function setup({
  branch = "main",
  dirty = "",
  checks = [{ name: "Test", status: "completed", conclusion: "success" }],
  plans = [{ migrations: [] }, { migrations: [], upToDate: true }],
  pushOk = true,
  answers = {},
  servedBuildIds = [BUILD_ID],
  linkedRef = "prod-ref",
  env = {},
} = {}) {
  const calls = { git: [], supabase: [], push: [], questions: [], fetch: [], log: [] };
  let clock = Date.parse("2026-10-14T18:00:00Z");
  const served = [...servedBuildIds];

  const git = (...args) => {
    calls.git.push(args);
    const command = args.join(" ");
    if (command === "status --porcelain") return dirty;
    if (command.startsWith("rev-parse --verify")) return TARGET;
    if (command === "rev-parse origin/release") return RELEASED;
    if (command === "rev-parse --abbrev-ref HEAD") return branch === null ? "HEAD" : branch;
    if (command === "rev-parse HEAD") return "c".repeat(40);
    if (command === "remote get-url origin") return "git@github.com:scottmttmn/movie-bowl.git";
    return "";
  };
  const gitOk = (...args) => {
    calls.git.push(args);
    const command = args.join(" ");
    if (command === `merge-base --is-ancestor ${TARGET} origin/main`) return true;
    if (command === `merge-base --is-ancestor ${TARGET} ${RELEASED}`) return false;
    if (command === `merge-base --is-ancestor ${RELEASED} ${TARGET}`) return true;
    if (command.startsWith("rev-parse --verify --quiet refs/tags/")) return false;
    return true;
  };
  const supabase = (...args) => {
    calls.supabase.push(args);
    if (plans.length === 0) throw new Error("unexpected dry run");
    const plan = plans.shift();
    if (plan instanceof Error) throw plan;
    return plan;
  };
  const fetch = async (url) => {
    calls.fetch.push(url);
    if (url.startsWith("https://api.github.com/")) return json(200, { check_runs: checks });
    if (url === `${PRODUCTION_URL}/version.json`) {
      const buildId = served.length > 1 ? served.shift() : served[0];
      return buildId === undefined ? json(503, {}) : json(200, { buildId });
    }
    throw new Error(`unexpected ${url}`);
  };

  const deps = {
    git,
    gitOk,
    supabase,
    pushMigrations: (database) => {
      calls.push.push(database);
      return pushOk;
    },
    linkedProjectRef: () => linkedRef,
    confirm: async (question) => {
      calls.questions.push(question);
      const key = Object.keys(answers).find((part) => question.includes(part));
      return key ? answers[key] : true;
    },
    fetch,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    log: (text) => calls.log.push(text),
    write: () => {},
    env,
    target: undefined,
  };
  return { deps, calls };
}

const commands = (calls) => calls.git.map((args) => args.join(" "));
const movedRelease = (calls) => commands(calls).includes(`push --quiet origin ${TARGET}:refs/heads/release`);
const restoredTo = (calls) => commands(calls).filter((command) => command.startsWith("switch")).at(-1);

describe("release", () => {
  it("ships, tags and exits 0 once production serves the new build", async () => {
    const { deps, calls } = setup();
    await expect(release(deps)).resolves.toBe(0);
    expect(movedRelease(calls)).toBe(true);
    expect(commands(calls)).toContain(`tag release-2026-10-14 ${TARGET}`);
    expect(commands(calls)).toContain("push --quiet origin release-2026-10-14");
    expect(restoredTo(calls)).toBe("switch --quiet main");
  });

  it("pushes pending migrations from the released commit before moving release", async () => {
    const { deps, calls } = setup({
      plans: [{ migrations: ["20261014000000_add_thing.sql"] }, { migrations: [], upToDate: true }],
    });
    await expect(release(deps)).resolves.toBe(0);
    expect(calls.push).toEqual([["--linked"]]);
    const order = commands(calls);
    expect(order.indexOf(`switch --quiet --detach ${TARGET}`)).toBeLessThan(order.indexOf("switch --quiet main"));
    expect(order.indexOf("switch --quiet main")).toBeLessThan(order.indexOf(`push --quiet origin ${TARGET}:refs/heads/release`));
  });

  it("uses RELEASE_DB_URL instead of the linked project when it is set", async () => {
    const { deps, calls } = setup({
      env: { RELEASE_DB_URL: "postgres://scratch" },
      linkedRef: null,
      plans: [{ migrations: ["one.sql"] }, { upToDate: true }],
    });
    await expect(release(deps)).resolves.toBe(0);
    expect(calls.supabase[0]).toEqual(["db", "push", "--db-url", "postgres://scratch", "--dry-run", "--output-format", "json"]);
    expect(calls.push).toEqual([["--db-url", "postgres://scratch"]]);
  });

  it("stops without moving release when the migration push fails, and restores the checkout", async () => {
    const { deps, calls } = setup({ plans: [{ migrations: ["one.sql"] }], pushOk: false });
    await expect(release(deps)).rejects.toThrow(new ReleaseStopped("The migration push failed. release has not moved."));
    expect(movedRelease(calls)).toBe(false);
    expect(restoredTo(calls)).toBe("switch --quiet main");
  });

  it("stops without moving release while Supabase still reports a pending migration", async () => {
    const { deps, calls } = setup({ plans: [{ migrations: ["one.sql"] }, { migrations: ["one.sql"], upToDate: false }] });
    await expect(release(deps)).rejects.toThrow("Supabase still reports pending migrations");
    expect(movedRelease(calls)).toBe(false);
    expect(restoredTo(calls)).toBe("switch --quiet main");
  });

  it("asks Supabase again before moving release rather than trusting the first answer", async () => {
    const { deps, calls } = setup({ plans: [{ migrations: [] }, { upToDate: false }] });
    await expect(release(deps)).rejects.toThrow("Supabase still reports pending migrations");
    expect(calls.supabase).toHaveLength(2);
    expect(movedRelease(calls)).toBe(false);
  });

  it("restores the checkout when the Supabase CLI itself fails", async () => {
    const { deps, calls } = setup({ plans: [new ReleaseStopped("supabase db push failed.")] });
    await expect(release(deps)).rejects.toThrow("supabase db push failed.");
    expect(restoredTo(calls)).toBe("switch --quiet main");
    expect(movedRelease(calls)).toBe(false);
  });

  it("restores a detached checkout to the commit it was on", async () => {
    const { deps, calls } = setup({ branch: null, plans: [{ migrations: ["one.sql"] }], pushOk: false });
    await expect(release(deps)).rejects.toThrow(ReleaseStopped);
    expect(restoredTo(calls)).toBe(`switch --quiet --detach ${"c".repeat(40)}`);
  });

  it("changes nothing when the migration push is declined", async () => {
    const { deps, calls } = setup({ plans: [{ migrations: ["one.sql"] }], answers: { "Push them": false } });
    await expect(release(deps)).resolves.toBe(0);
    expect(calls.push).toEqual([]);
    expect(movedRelease(calls)).toBe(false);
    expect(restoredTo(calls)).toBe("switch --quiet main");
  });

  it("changes nothing when moving release is declined", async () => {
    const { deps, calls } = setup({ answers: { "Move release": false } });
    await expect(release(deps)).resolves.toBe(0);
    expect(movedRelease(calls)).toBe(false);
    expect(commands(calls).some((command) => command.startsWith("tag "))).toBe(false);
  });

  it("asks before releasing a commit whose CI is not green, and stops on no", async () => {
    const { deps, calls } = setup({
      checks: [{ name: "Playwright", status: "completed", conclusion: "failure" }],
      answers: { "not all green": false },
    });
    await expect(release(deps)).resolves.toBe(0);
    expect(calls.questions).toHaveLength(1);
    expect(calls.supabase).toEqual([]);
    expect(commands(calls).some((command) => command.startsWith("switch"))).toBe(false);
  });

  it("refuses a dirty checkout before doing anything", async () => {
    const { deps, calls } = setup({ dirty: " M src/App.jsx" });
    await expect(release(deps)).rejects.toThrow("uncommitted changes");
    expect(calls.git).toHaveLength(1);
  });

  it("refuses a checkout that is not linked to a Supabase project", async () => {
    const { deps } = setup({ linkedRef: null });
    await expect(release(deps)).rejects.toThrow("not linked to a Supabase project");
  });

  it("exits 1 as deployment unverified when production never serves the build", async () => {
    const { deps, calls } = setup({ servedBuildIds: ["0".repeat(12)] });
    await expect(release(deps)).resolves.toBe(1);
    // release has moved and stays moved: a late deploy is not a broken one.
    expect(movedRelease(calls)).toBe(true);
    expect(commands(calls).some((command) => command.includes("--force") || command.includes("reset"))).toBe(false);
    expect(calls.log.at(-1)).toMatch(/^\nDeployment unverified: .* release has moved and is tagged release-2026-10-14\./);
    expect(calls.fetch.filter((url) => url.endsWith("/version.json")).length).toBe(DEPLOY_WAIT_MS / 15_000);
  });

  it("keeps polling through failed answers until the build is served", async () => {
    const { deps } = setup({ servedBuildIds: [undefined, "0".repeat(12), BUILD_ID] });
    await expect(release(deps)).resolves.toBe(0);
  });
});

describe("repoSlug", () => {
  it("reads ssh and https remotes", () => {
    expect(repoSlug("git@github.com:scottmttmn/movie-bowl.git")).toBe("scottmttmn/movie-bowl");
    expect(repoSlug("https://github.com/someone/fork")).toBe("someone/fork");
  });
});
