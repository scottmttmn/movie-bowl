import { expect, test } from "./support/fakeBackend";

test("a member can create a bowl, add and draw a title, see history, and return it", async ({
  page,
  backend,
}) => {
  await backend.authenticate(page);
  await page.goto("/bowls");

  await expect(page.getByRole("heading", { name: "My Bowls" })).toBeVisible();
  await expect(page.getByPlaceholder("Name your bowl")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("first-run.png") });
  await page.getByRole("button", { name: "Add a movie", exact: true }).click();
  await expect(page.getByPlaceholder("Name your bowl")).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByPlaceholder("Name your bowl").fill("Smoke Night");
  await page.getByRole("button", { name: "Create bowl", exact: true }).click();

  // The client names a new bowl itself, so the id is a fresh UUID.
  await expect(page).toHaveURL(/\/bowl\/[0-9a-f-]{36}$/);
  const bowlPath = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: "Smoke Night", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Add to this bowl" }).click();
  await page.getByPlaceholder("Movie, actor or director").fill("Smoke Feature");
  await page.getByRole("button", { name: 'Add "Smoke Feature"' }).click();

  await expect(page.getByRole("status").filter({ hasText: "Added Smoke Feature to Smoke Night" })).toBeVisible();
  await page.getByRole("button", { name: "Close add movie" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Drawing from 1 title\b/i })
  ).toBeVisible();

  const drawButton = page.getByRole("button", {
    name: /Draw movie from bowl\. Press and hold to draw\./i,
  });
  await drawButton.press("Enter");
  await expect(page.getByRole("dialog", { name: "Reveal a movie?" })).toBeVisible();
  await page.getByRole("button", { name: "Reveal Movie" }).click();

  await expect(page.getByRole("heading", { name: /Smoke Feature/ })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Close", exact: true }).last().click();

  await page.goto("/watch-list");
  await expect(page.getByRole("heading", { name: "Watch History", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Smoke Feature" })).toBeVisible();

  await page.goto(bowlPath);
  await expect(page.getByText("1 watched", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await page.getByRole("button", { name: "Smoke Feature" }).click();
  await page.getByRole("button", { name: "Move to Bowl" }).click();
  await expect(page.getByRole("dialog", { name: "Put movie back in bowl?" })).toBeVisible();
  await page.getByRole("button", { name: "Put movie back in bowl" }).click();

  await expect(page.getByRole("img", { name: "Nothing watched yet" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Drawing from 1 title\b/i })
  ).toBeVisible();

  expect(backend.state.bowls).toHaveLength(1);
  expect(backend.state.bowl_movies).toHaveLength(1);
  expect(backend.state.bowl_movies[0].drawn_at).toBeNull();
  expect(backend.state.bowl_draw_events[0].returned_at).not.toBeNull();
  expect(backend.state.user_watch_events).toHaveLength(0);
});

test("an owner removes a draw nobody watched from the bowl's history, and personal history keeps it", async ({
  page,
  backend,
}) => {
  const drawnAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  backend.state.bowls.push({
    id: "bowl-owner-history",
    name: "Owner History Bowl",
    owner_id: "user-smoke",
    draw_access_mode: "all_members",
    draw_method: "person_first",
    created_at: "2026-09-01T12:00:00.000Z",
  });
  backend.state.bowl_members.push({
    id: "member-owner-history",
    bowl_id: "bowl-owner-history",
    user_id: "user-smoke",
    role: "Owner",
  });
  backend.state.bowl_movies.push({
    id: "movie-unwatched",
    bowl_id: "bowl-owner-history",
    tmdb_id: -301,
    title: "Nobody Watched This",
    added_by: "user-smoke",
    added_at: drawnAt,
    drawn_at: drawnAt,
    drawn_by: "user-smoke",
  });
  backend.state.bowl_draw_events.push({
    id: "draw-unwatched",
    bowl_id: "bowl-owner-history",
    source_bowl_movie_id: "movie-unwatched",
    tmdb_id: -301,
    title: "Nobody Watched This",
    added_by: "user-smoke",
    drawn_at: drawnAt,
    returned_at: null,
  });
  backend.state.user_watch_events.push({
    id: "watch-unwatched",
    user_id: "user-smoke",
    source_draw_event_id: "draw-unwatched",
    source_kind: "bowl_draw",
    title: "Nobody Watched This",
    watched_on: drawnAt.slice(0, 10),
  });

  await backend.authenticate(page);
  await page.goto("/bowl/bowl-owner-history");
  await expect(page.getByText("1 watched", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await page.getByRole("button", { name: "Nobody Watched This" }).click();

  // Past the undo window, so putting it back is not offered; removing it is.
  await expect(page.getByRole("button", { name: "Move to Bowl" })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Remove \"Nobody Watched This\" from this bowl's watched history" })
    .click();
  const confirm = page.getByRole("dialog", { name: "Remove from watched history?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Remove from watched" }).click();

  await expect(page.getByRole("img", { name: "Nothing watched yet" })).toBeVisible();
  expect(backend.state.bowl_draw_events[0].removed_at).not.toBeNull();
  expect(backend.state.bowl_draw_events[0].returned_at).toBeNull();
  expect(backend.state.user_watch_events).toHaveLength(1);

  await page.goto("/watch-list");
  await expect(page.getByRole("heading", { name: "Nobody Watched This" })).toBeVisible();
});


test("a first draw adds a subscription service to the profile and remembers it after reload", async ({ page, backend }) => {
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  backend.state.bowls.push({ id: "services-bowl", name: "Service Night", owner_id: "user-smoke", draw_access_mode: "all_members", draw_method: "person_first" });
  backend.state.bowl_members.push({ id: "services-owner", bowl_id: "services-bowl", user_id: "user-smoke", role: "Owner" });
  backend.state.bowl_movies.push({ id: "services-movie", bowl_id: "services-bowl", tmdb_id: 101, title: "First Feature", added_by: "user-smoke", drawn_at: null });
  await backend.authenticate(page);
  await page.route("**/api/tmdb/movie/providers**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ results: { US: {
      flatrate: [{ provider_id: 1899, provider_name: "HBO Max", logo_path: null }, { provider_id: 8, provider_name: "Netflix", logo_path: null }],
      rent: [{ provider_id: 2, provider_name: "Apple TV", logo_path: null }],
    } } }),
  }));
  await page.goto("/bowl/services-bowl");
  await expect(page.getByRole("button", { name: /Drawing from 1 title/ })).toBeVisible();
  await page.getByRole("button", { name: /Draw movie from bowl\. Press and hold to draw\./ }).press("Enter");
  await page.getByRole("button", { name: "Reveal Movie" }).click();
  await expect(page.getByRole("heading", { name: "First Feature", exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Where else to watch/ }).click();
  await expect(page.getByRole("button", { name: "Streaming on Max and Netflix" })).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({ path: test.info().outputPath("add-services.png") });
  await page.getByRole("button", { name: "Add Max to your services" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "HBO Max (in your services)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Also streaming on Netflix" })).toHaveAttribute("aria-expanded", "false");
  expect(backend.state.profiles.find((profile) => profile.id === "user-smoke").streaming_services).toEqual(["Max"]);
  await page.screenshot({ path: test.info().outputPath("saved-service.png") });
  await page.goto("/settings#streaming-services");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Position of Max", exact: true })).toHaveValue("0");
  expect(consoleErrors).toEqual([]);
});
