import { expect, test } from "@playwright/test";

// The release smoke checklist's core flow against staging's real database and
// TMDB: create a bowl, add a movie found by search, draw it, see it in Watch
// History, put it back. Everything else in the gate runs against fakes, so
// this is the one place a migration, a policy or a Vercel variable meets the
// code that relies on it before Wednesday.
//
// The account is shared by every run, so each run starts by clearing what a
// failed run may have left and ends by deleting what it made. The workflow
// runs one at a time for the same reason. Because it deletes every bowl the
// account owns, it must be an account nobody uses for anything else.
const SUPABASE_URL = process.env.STAGING_SUPABASE_URL;
const ANON_KEY = process.env.STAGING_SUPABASE_ANON_KEY;
const EMAIL = process.env.STAGING_SMOKE_EMAIL;
const PASSWORD = process.env.STAGING_SMOKE_PASSWORD;
const MOVIE = "Paddington 2";

test.skip(
  !SUPABASE_URL || !ANON_KEY || !EMAIL || !PASSWORD,
  "Needs STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, STAGING_SMOKE_EMAIL and STAGING_SMOKE_PASSWORD."
);

// A password grant rather than a magic link, so neither an inbox nor the
// staging service role key is involved: the run holds no more power than the
// test account itself.
async function signIn() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const session = await response.json();
  if (!response.ok) throw new Error(`Sign-in failed: ${session.error_description || session.msg || response.status}`);
  return session;
}

async function rest(session, path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      authorization: `Bearer ${session.access_token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`${init.method || "GET"} ${path} answered ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

// Through the same RPCs the app uses, so cleanup is held to the account's own
// permissions like everything else here.
async function clearAccount(session) {
  const userId = session.user.id;
  const bowls = await rest(session, `bowls?select=id&owner_id=eq.${userId}`);
  for (const bowl of bowls) {
    await rest(session, "rpc/delete_owned_bowl", { method: "POST", body: JSON.stringify({ p_bowl_id: bowl.id }) });
  }
  const history = await rest(session, `user_watch_events?select=id&user_id=eq.${userId}`);
  for (const entry of history) {
    await rest(session, "rpc/delete_user_watch_event", { method: "POST", body: JSON.stringify({ p_event_id: entry.id }) });
  }
}

let session;

test.beforeAll(async () => {
  session = await signIn();
  await clearAccount(session);
});

test.afterAll(async () => {
  if (session) await clearAccount(session);
});

test("create a bowl, add a movie from TMDB, draw it, find it in history, and put it back", async ({ page }) => {
  const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: storageKey, value: JSON.stringify(session) }
  );
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const bowlName = `Smoke ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
  await page.goto("/bowls");
  await expect(page.getByRole("heading", { name: "My Bowls" })).toBeVisible();
  await page.getByPlaceholder("Name your bowl").fill(bowlName);
  await page.getByRole("button", { name: "Create bowl", exact: true }).click();
  await expect(page).toHaveURL(/\/bowl\/[0-9a-f-]{36}$/);
  const bowlPath = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: bowlName, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Add to this bowl" }).click();
  await page.getByPlaceholder("Movie, actor or director").fill(MOVIE);
  await page.getByRole("button", { name: `Details for ${MOVIE}`, exact: true }).first().click();
  await page.getByRole("button", { name: `Add to ${bowlName}`, exact: true }).click();
  await expect(page.getByPlaceholder("Movie, actor or director")).toHaveValue("");
  await page.getByRole("button", { name: "Close add movie" }).click();
  await expect(page.getByRole("button", { name: /Drawing from 1 title\b/i })).toBeVisible();

  await page.getByRole("button", { name: /Draw movie from bowl\. Press and hold to draw\./i }).press("Enter");
  await page.getByRole("button", { name: "Reveal Movie" }).click();
  await expect(page.getByRole("heading", { name: MOVIE, exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Close", exact: true }).last().click();

  await page.goto("/watch-list");
  await expect(page.getByRole("heading", { name: "Watch History", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: MOVIE })).toBeVisible();

  await page.goto(bowlPath);
  await expect(page.getByText("1 watched", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await page.getByRole("button", { name: MOVIE }).click();
  await page.getByRole("button", { name: "Move to Bowl" }).click();
  await page.getByRole("button", { name: "Put movie back in bowl" }).click();
  await expect(page.getByRole("img", { name: "Nothing watched yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Drawing from 1 title\b/i })).toBeVisible();

  expect(pageErrors).toEqual([]);
});
