import { expect, test } from "@playwright/test";

// The release smoke checklist's core flow against staging's real database and
// TMDB: create a bowl, add a movie found by search, draw it, see it in Watch
// History, put it back. Then the two paths whose outcome only the database
// decides: a signed-out guest adding through a link, and a rotation draw.
// Everything else in the gate runs against fakes, so this is the one place a
// migration, a policy or a Vercel variable meets the code that relies on it
// before Wednesday. A flow belongs here only if a bug in it could show up
// against the real services and not against the fakes.
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
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method || "GET"} ${path} answered ${response.status}: ${text}`);
  // An insert answers with nothing unless asked, and a void function with nothing at all.
  return text ? JSON.parse(text) : null;
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

// Signs the page in as the smoke account and collects anything it throws.
async function signedIn(page) {
  const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: storageKey, value: JSON.stringify(session) }
  );
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return pageErrors;
}

const smokeName = (label) => `Smoke ${label} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

test("create a bowl, add a movie from TMDB, draw it, find it in history, and put it back", async ({ page }) => {
  const pageErrors = await signedIn(page);

  const bowlName = smokeName("core");
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

// The two things here only the real database decides. A guest link writes
// through a Vercel function holding staging's service role key, so this is
// where a missing key or a policy change shows up. Rotation is chosen inside
// draw_bowl_movie_by_rotation, so the fakes can only replay what it returns.
// With two titles each for the owner and a guest, the second draw has to go
// to whoever the first one passed over.
test("a guest adds through a link, and a rotation bowl gives the owner and the guest a turn each", async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  const userId = session.user.id;
  const bowlName = smokeName("rotation");
  const [bowl] = [].concat(
    await rest(session, "rpc/create_owned_bowl", {
      method: "POST",
      body: JSON.stringify({ p_bowl_id: crypto.randomUUID(), p_name: bowlName }),
    })
  );
  await rest(session, "rpc/save_bowl_draw_method", {
    method: "POST",
    body: JSON.stringify({ p_bowl_id: bowl.id, p_method: "rotation" }),
  });
  // Custom slips, written the way the app writes them, so the owner's half
  // costs no TMDB calls.
  const ownerTitles = ["Smoke owner pick one", "Smoke owner pick two"];
  for (const title of ownerTitles) {
    await rest(session, "bowl_movies", {
      method: "POST",
      body: JSON.stringify({
        id: crypto.randomUUID(),
        bowl_id: bowl.id,
        added_by: userId,
        tmdb_id: -Math.floor(Math.random() * 2_000_000_000) - 1,
        title,
        genres: [],
        is_pinned: false,
        snapshot_at: new Date().toISOString(),
      }),
    });
  }
  const token = crypto.randomUUID();
  await rest(session, "bowl_add_links", {
    method: "POST",
    body: JSON.stringify({ bowl_id: bowl.id, created_by: userId, token, max_adds: 2, default_contributor_name: "Smoke Guest" }),
  });

  // The guest is signed out: a browser context of its own, with nothing in storage.
  const guestContext = await browser.newContext({ baseURL });
  const guest = await guestContext.newPage();
  const guestErrors = [];
  guest.on("pageerror", (error) => guestErrors.push(error.message));
  await guest.goto(`/add-to-bowl/${token}`);
  await expect(guest.getByRole("heading", { name: `Add movies to ${bowlName}` })).toBeVisible();
  await expect(guest.getByLabel("Added by")).toHaveValue("Smoke Guest");
  await guest.getByPlaceholder("Movie, actor or director").fill("Paddington");
  await guest.getByRole("button", { name: "Details for Paddington", exact: true }).first().click();
  await guest.getByRole("dialog").getByRole("button", { name: "Add Movie", exact: true }).click();
  await expect(guest.getByText("Movie added as Smoke Guest. 1 add remaining.")).toBeVisible();
  await guest.getByPlaceholder("Movie, actor or director").fill("Smoke guest pick");
  await guest.getByRole("button", { name: 'Add "Smoke guest pick"' }).click();
  await expect(guest.getByText("Movie added as Smoke Guest. This link is now used up.")).toBeVisible();
  await guestContext.close();
  expect(guestErrors).toEqual([]);

  const guestRows = await rest(session, `bowl_movies?select=title,added_by,added_by_name&bowl_id=eq.${bowl.id}&added_by=is.null`);
  expect(guestRows.map((row) => row.title).sort()).toEqual(["Paddington", "Smoke guest pick"]);
  expect(guestRows.every((row) => row.added_by_name === "Smoke Guest")).toBe(true);

  const pageErrors = await signedIn(page);
  await page.goto(`/bowl/${bowl.id}`);
  const anyTitle = new RegExp(`^(${[...ownerTitles, "Paddington", "Smoke guest pick"].join("|")})$`);
  for (const remaining of [4, 3]) {
    await expect(page.getByRole("button", { name: new RegExp(`Drawing from ${remaining} titles\\b`, "i") })).toBeVisible();
    await page.getByRole("button", { name: /Draw movie from bowl\. Press and hold to draw\./i }).press("Enter");
    await page.getByRole("button", { name: "Reveal Movie" }).click();
    await expect(page.getByRole("dialog", { name: anyTitle })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Close", exact: true }).last().click();
  }

  const draws = await rest(session, `bowl_draw_events?select=title,added_by,added_by_name&bowl_id=eq.${bowl.id}`);
  expect(draws).toHaveLength(2);
  expect(draws.filter((draw) => draw.added_by === userId)).toHaveLength(1);
  expect(draws.filter((draw) => draw.added_by === null && draw.added_by_name === "Smoke Guest")).toHaveLength(1);
  expect(pageErrors).toEqual([]);
});
