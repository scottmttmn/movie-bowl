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
  await expect(bowlButton).toBeFocused();
  await bowlButton.press("Enter");

  await expect(page).toHaveURL(/\/tv\/bowl\/bowl-tv$/);
  await expect(page.getByRole("heading", { name: /Let the bowl decide/i })).toBeVisible();
  await expect(page.getByText("OK to select", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Draw a movie/ }).press("Enter");
  await expect(page.getByRole("dialog", { name: "Reveal one movie?" })).toBeVisible();
  await page.getByRole("button", { name: "Reveal a movie" }).press("Enter");
  await expect(page.getByRole("heading", { name: "TV Smoke Feature" })).toBeVisible({
    timeout: 15_000,
  });
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
  await drawButton.press("ArrowDown");
  await expect(recentCard).toBeFocused();
  await recentCard.press("Enter");

  await expect(page.getByRole("heading", { name: "Recent History Feature" })).toBeVisible();
  await expect(page.getByText("The recent bowl note.")).toBeVisible();
  await expect(page.getByText("Didn't watch it?")).toBeVisible();
  await expect(
    page.getByText(/leaves this list and is removed from everyone's Watch History/i)
  ).toBeVisible();
  await expect(page.locator(".tv-history-detail-page .tv-kept-badge")).toHaveCount(0);
  const detailClose = page.getByRole("button", { name: "Close", exact: true });
  await expect(detailClose).toBeFocused();
  expect(backend.state.bowl_draw_events[0].returned_at).toBeNull();
  expect(backend.state.user_watch_events).toHaveLength(2);

  await detailClose.press("Enter");
  await expect(recentCard).toBeFocused();
  await recentCard.press("Enter");
  // Wait for the detail page to take its autofocus, or the Enter below races it
  // and lands on Close instead of the return action.
  await expect(page.getByRole("button", { name: "Close", exact: true })).toBeFocused();
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

  const olderCard = page.getByRole("button", {
    name: "View details for Older History Feature in Watch History",
  });
  await olderCard.press("Enter");
  await expect(page.getByText("Want it back in the bowl?")).toBeVisible();
  await expect(
    page.getByText(/leaves this list but stays in everyone's Watch History/i)
  ).toBeVisible();
  await expect(page.getByText("Didn't watch it?")).toHaveCount(0);
  await page.getByRole("button", { name: "Put movie back in bowl" }).press("Enter");
  await expect(page.getByText(/outside the two-hour undo window/i)).toBeVisible();
  await expect(
    page.getByText(/leaves this bowl's list but stays in everyone's Watch History/i)
  ).toBeVisible();
  await page.getByRole("button", { name: "Put movie back in bowl" }).press("Enter");

  await expect(
    page.getByText("Older History Feature is back in the bowl.")
  ).toBeVisible();
  expect(
    backend.state.user_watch_events.some(
      (event) => event.source_draw_event_id === "draw-tv-older"
    )
  ).toBe(true);

  // A returned draw leaves Watch History outright, the same as on the phone,
  // rather than staying on as a card claiming it is back in the bowl.
  await expect(
    page.getByRole("button", {
      name: "View details for Older History Feature in Watch History",
    })
  ).toHaveCount(0);
  expect(
    backend.state.bowl_movies.some(
      (movie) => movie.title === "Older History Feature" && movie.drawn_at === null
    )
  ).toBe(true);
});
