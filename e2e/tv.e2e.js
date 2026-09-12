import { expect, test } from "./support/fakeBackend";

test("the signed-out TV route shows pairing instead of the standard login", async ({
  page,
  backend,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "TV smoke coverage uses the desktop viewport.");

  await page.goto("/tv");

  await expect(page.getByRole("heading", { name: "Connect Movie Bowl" })).toBeVisible();
  await expect(page.getByText("ABCD-2345")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Login" })).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(backend.requests).toContainEqual(
    expect.objectContaining({ method: "POST", pathname: "/api/tv-pairing/start" })
  );
});

test("a paired TV can use remote selection to open a bowl", async ({ page, backend }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "TV smoke coverage uses the desktop viewport.");

  await page.setViewportSize({ width: 1920, height: 1080 });
  await backend.authenticate(page);
  backend.state.bowls.push({
    id: "bowl-tv",
    name: "Smoke TV",
    owner_id: "user-smoke",
    draw_access_mode: "all_members",
    draw_method: "person_first",
    created_at: "2026-08-21T12:00:00.000Z",
  });
  backend.state.bowl_members.push({
    id: "member-tv",
    bowl_id: "bowl-tv",
    user_id: "user-smoke",
    role: "Owner",
  });
  backend.state.bowl_movies.push({
    id: "movie-tv",
    bowl_id: "bowl-tv",
    tmdb_id: -100,
    title: "TV Smoke Feature",
    added_by: "user-smoke",
    added_by_name: null,
    added_at: "2026-08-21T12:00:00.000Z",
    drawn_at: null,
    genres: ["Drama"],
    runtime: 100,
  });

  await page.goto("/tv/bowls");

  await expect(page.getByRole("heading", { name: "Choose a bowl" })).toBeVisible();
  const bowlButton = page.getByRole("button", { name: /Smoke TV/ });
  const signOut = page.getByRole("button", { name: "Sign out of this TV", exact: true });
  await expect(bowlButton).toBeFocused();
  await bowlButton.press("ArrowUp");
  await expect(signOut).toBeFocused();
  await signOut.press("ArrowDown");
  await expect(bowlButton).toBeFocused();
  await bowlButton.press("ArrowUp");
  await expect(signOut).toBeFocused();
  await signOut.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Sign out of this TV?" });
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const confirm = dialog.getByRole("button", { name: "Sign out", exact: true });
  await expect(cancel).toBeFocused();
  await cancel.press("ArrowRight");
  await expect(confirm).toBeFocused();
  await confirm.press("ArrowDown");
  await expect(confirm).toBeFocused();
  await confirm.press("ArrowLeft");
  await expect(cancel).toBeFocused();
  await cancel.press("Enter");
  await expect(signOut).toBeFocused();
  await signOut.press("Enter");
  await expect(cancel).toBeFocused();
  await cancel.press("Escape");
  await expect(signOut).toBeFocused();
  expect(backend.requests.filter((request) => request.pathname === "/auth/v1/logout")).toHaveLength(0);
  await signOut.press("ArrowDown");
  await expect(bowlButton).toBeFocused();
  await bowlButton.press("Enter");

  await expect(page).toHaveURL(/\/tv\/bowl\/bowl-tv$/);
  await expect(page.getByRole("heading", { level: 1, name: "Smoke TV" })).toBeVisible();
  await expect(page.getByText("OK to select", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Draw a movie/ }).press("Enter");
  await expect(page.getByRole("dialog", { name: "Reveal one movie?" })).toBeVisible();
  await page.getByRole("button", { name: "Reveal a movie" }).press("Enter");
  await expect(page.getByRole("heading", { name: "TV Smoke Feature" })).toBeVisible({
    timeout: 15_000,
  });
});

test("TV sign-out can retry a failure, revokes only this session, and returns to pairing", async ({ page, backend }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "TV smoke coverage uses the desktop viewport.");
  await page.setViewportSize({ width: 1280, height: 720 });
  await backend.authenticate(page);
  await page.goto("/tv/bowls");
  await expect(page.getByRole("heading", { name: "No bowls found" })).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem("movie-bowl:tv:last-bowl:user-smoke", "remembered-bowl");
    localStorage.setItem("movie-bowl:tv:draw-settings:user-smoke", JSON.stringify({ theaterModeEnabled: true }));
    localStorage.setItem("movie-bowl:tv:recent-trailers", "[101]");
  });

  // Signing out is the only thing the picker offers an empty account. Nothing
  // here navigates into the phone app: on a television that is a screen no
  // remote can drive, and the Google TV shell closes itself rather than show it.
  await expect(page.getByRole("button", { name: "Exit TV mode", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open the full app" })).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Sign out of this TV", exact: true })).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("tv-account-actions.png") });
  await page.getByRole("button", { name: "Sign out of this TV", exact: true }).press("Enter");
  const dialog = page.getByRole("dialog", { name: "Sign out of this TV?" });
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const confirm = dialog.getByRole("button", { name: "Sign out", exact: true });
  await expect(cancel).toBeFocused();
  await cancel.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await confirm.press("Tab");
  await expect(cancel).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("tv-sign-out-confirmation.png") });

  let attempts = 0;
  let finishSignOut;
  const pendingResponse = new Promise((resolve) => { finishSignOut = resolve; });
  await page.route("**/auth/v1/logout?*", async (route) => {
    expect(new URL(route.request().url()).searchParams.get("scope")).toBe("local");
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 400, json: { message: "Sign-out unavailable" } });
      return;
    }
    await pendingResponse;
    await route.fulfill({ status: 200, json: {} });
  });
  await confirm.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText("Couldn’t sign out");
  expect(backend.consoleErrors).toEqual(["Failed to load resource: the server responded with a status of 400 (Bad Request)"]);
  backend.consoleErrors.length = 0;
  expect(await page.evaluate(() => Boolean(localStorage.getItem("sb-127-auth-token")))).toBe(true);
  await confirm.press("Enter");
  const pending = dialog.getByRole("button", { name: "Signing out…" });
  await expect(pending).toBeVisible();
  await pending.press("Enter");
  await pending.press("Escape");
  await expect(dialog).toBeVisible();
  // Polled, not read once: `attempts` is incremented inside the route handler,
  // so it counts requests that have reached the network. The button flips to
  // "Signing out…" the moment the click handler runs, which is earlier -- and
  // nothing between that and here waits for the fetch to be issued. Reading it
  // once raced the request and failed about a third of the time.
  await expect.poll(() => attempts).toBe(2);
  finishSignOut();
  await expect(page.getByRole("heading", { name: "Connect Movie Bowl" })).toBeVisible();
  await expect(page.getByText("smoke@example.com")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("sb-127-auth-token"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("movie-bowl:tv:last-bowl:user-smoke"))).toBe("remembered-bowl");
  expect(await page.evaluate(() => localStorage.getItem("movie-bowl:tv:recent-trailers"))).toBe("[101]");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("movie-bowl:tv:draw-settings:user-smoke"))))
    .toEqual({ theaterModeEnabled: true });
});

// A mask clips everything the element paints, and this app's focus ring is an
// outer box-shadow -- so masking the ticket itself made it the one control on
// the screen with no visible focus at all. The mask belongs on a face inside
// the button, and only a real browser can tell you it moved.
test("the theater ticket can show a focus ring", async ({ page, backend }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "TV smoke coverage uses the desktop viewport.");

  await page.setViewportSize({ width: 1920, height: 1080 });
  await backend.authenticate(page);
  backend.state.bowls.push({
    id: "bowl-tv-focus", name: "Focus TV", owner_id: "user-smoke",
    draw_access_mode: "all_members", draw_method: "person_first",
    created_at: "2026-08-21T12:00:00.000Z",
  });
  backend.state.bowl_members.push({
    id: "member-tv-focus", bowl_id: "bowl-tv-focus", user_id: "user-smoke", role: "Owner",
  });
  backend.state.bowl_movies.push({
    id: "movie-focus", bowl_id: "bowl-tv-focus", tmdb_id: -400, title: "Focus Feature",
    added_by: "user-smoke", added_by_name: null, added_at: "2026-08-21T12:00:00.000Z",
    drawn_at: null, genres: ["Drama"], runtime: 100,
  });

  await page.goto("/tv/bowl/bowl-tv-focus");

  const ticket = page.getByRole("switch", { name: /theater mode/i });
  await ticket.focus();

  const painted = await ticket.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      masked: (cs.maskImage || cs.webkitMaskImage || "none") !== "none",
      ring: cs.boxShadow,
    };
  });

  expect(painted.masked).toBe(false);
  expect(painted.ring).not.toBe("none");
});

test("TV Watch History opens details and applies the bounded return cleanup", async ({
  page,
  backend,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "TV smoke coverage uses the desktop viewport.");

  await page.setViewportSize({ width: 1920, height: 1080 });
  await backend.authenticate(page);
  const now = Date.now();
  const recentDrawnAt = new Date(now - 60 * 60 * 1000).toISOString();
  const olderDrawnAt = new Date(now - 3 * 60 * 60 * 1000).toISOString();
  backend.state.bowls.push({
    id: "bowl-tv-history",
    name: "TV History Bowl",
    owner_id: "user-smoke",
    draw_access_mode: "all_members",
    draw_method: "person_first",
    created_at: olderDrawnAt,
  });
  backend.state.bowl_members.push({
    id: "member-tv-history",
    bowl_id: "bowl-tv-history",
    user_id: "user-smoke",
    role: "Owner",
  });
  backend.state.bowl_movies.push(
    {
      id: "movie-tv-ready",
      bowl_id: "bowl-tv-history",
      tmdb_id: -200,
      title: "Ready Feature",
      added_by: "user-smoke",
      added_at: olderDrawnAt,
      drawn_at: null,
    },
    {
      id: "movie-tv-recent",
      bowl_id: "bowl-tv-history",
      tmdb_id: -201,
      title: "Recent History Feature",
      note: "The recent bowl note.",
      added_by: "user-smoke",
      added_by_name: "Sam",
      added_at: olderDrawnAt,
      drawn_at: recentDrawnAt,
      drawn_by: "user-smoke",
    },
    {
      id: "movie-tv-older",
      bowl_id: "bowl-tv-history",
      tmdb_id: -202,
      title: "Older History Feature",
      note: "The older bowl note.",
      added_by: "user-smoke",
      added_by_name: "Jo",
      added_at: olderDrawnAt,
      drawn_at: olderDrawnAt,
      drawn_by: "user-smoke",
    }
  );
  backend.state.bowl_draw_events.push(
    {
      id: "draw-tv-recent",
      bowl_id: "bowl-tv-history",
      source_bowl_movie_id: "movie-tv-recent",
      tmdb_id: -201,
      title: "Recent History Feature",
      note: "The recent bowl note.",
      added_by: "user-smoke",
      added_by_name: "Sam",
      drawn_at: recentDrawnAt,
      returned_at: null,
    },
    {
      id: "draw-tv-older",
      bowl_id: "bowl-tv-history",
      source_bowl_movie_id: "movie-tv-older",
      tmdb_id: -202,
      title: "Older History Feature",
      note: "The older bowl note.",
      added_by: "user-smoke",
      added_by_name: "Jo",
      drawn_at: olderDrawnAt,
      returned_at: null,
    }
  );
  backend.state.user_watch_events.push(
    {
      id: "watch-tv-recent",
      user_id: "user-smoke",
      source_draw_event_id: "draw-tv-recent",
      source_kind: "bowl_draw",
      title: "Recent History Feature",
      watched_on: recentDrawnAt.slice(0, 10),
    },
    {
      id: "watch-tv-older",
      user_id: "user-smoke",
      source_draw_event_id: "draw-tv-older",
      source_kind: "bowl_draw",
      title: "Older History Feature",
      watched_on: olderDrawnAt.slice(0, 10),
    }
  );

  await page.goto("/tv/bowl/bowl-tv-history");

  const drawButton = page.getByRole("button", { name: /Draw a movie/ });
  const recentCard = page.getByRole("button", {
    name: "View details for Recent History Feature in Watch History",
  });
  await expect(drawButton).toBeFocused();

  // Theater mode sits between the draw control and the strip, so down passes
  // through it. Where it lands in the strip is geometry, not order: the ticket
  // is centred under the stage, so the card beneath it is not the first one.
  await drawButton.press("ArrowDown");
  await expect(page.getByRole("switch", { name: /theater mode/i })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.locator(".tv-recent-movie:focus")
  ).toHaveCount(1);

  await recentCard.focus();
  await recentCard.press("Enter");

  await expect(page.getByRole("heading", { name: "Recent History Feature" })).toBeVisible();
  await expect(page.getByText("The recent bowl note.")).toBeVisible();
  await expect(page.getByText("Didn't watch it?")).toBeVisible();
  await expect(
    page.getByText(/removes this pick from everyone's Watch History/i)
  ).toBeVisible();
  await expect(page.locator(".tv-history-detail-page .tv-kept-badge")).toHaveCount(0);
  const detailClose = page.getByRole("button", { name: "Close", exact: true });
  await expect(detailClose).toBeFocused();
  expect(backend.state.bowl_draw_events[0].returned_at).toBeNull();
  expect(backend.state.user_watch_events).toHaveLength(2);

  await detailClose.press("Enter");
  await expect(recentCard).toBeFocused();
  await recentCard.press("Enter");
  await page.getByRole("button", { name: "Put movie back in bowl" }).press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Put “Recent History Feature” back in the bowl?" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Put movie back in bowl" }).press("Enter");

  await expect(page.getByText("Recent History Feature is back in the bowl.")).toBeVisible();
  expect(
    backend.state.user_watch_events.some(
      (event) => event.source_draw_event_id === "draw-tv-recent"
    )
  ).toBe(false);

  await expect(recentCard).toHaveCount(0);

  // Past the undo window the return is refused rather than offered, and the
  // pick stays in Watch History because the group did watch it.
  const olderCard = page.getByRole("button", {
    name: "View details for Older History Feature in Watch History",
  });
  await olderCard.press("Enter");
  await expect(
    page.getByText(/available for two hours after the draw/i)
  ).toBeVisible();
  await expect(page.getByText("Didn't watch it?")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Put movie back in bowl" })
  ).toHaveCount(0);
  await expect(page.getByText(/back in bowl/i)).toHaveCount(0);
  expect(
    backend.state.user_watch_events.some(
      (event) => event.source_draw_event_id === "draw-tv-older"
    )
  ).toBe(true);
});
