import { expect, test } from "./support/fakeBackend";

function seedTwoBowls(backend) {
  backend.state.bowls.push(
    {
      id: "solo-bowl-1", name: "Solo One", owner_id: "user-smoke",
      draw_access_mode: "all_members", draw_method: "person_first",
    },
    {
      id: "solo-bowl-2", name: "Solo Two", owner_id: "user-smoke",
      draw_access_mode: "all_members", draw_method: "person_first",
    }
  );
  backend.state.bowl_members.push(
    { id: "solo-member-1", bowl_id: "solo-bowl-1", user_id: "user-smoke", role: "Owner" },
    { id: "solo-member-2", bowl_id: "solo-bowl-2", user_id: "user-smoke", role: "Owner" }
  );
  backend.state.bowl_movies.push(
    {
      id: "solo-movie-1", bowl_id: "solo-bowl-1", title: "Solo One Pick", tmdb_id: -11,
      added_by: "user-smoke", added_at: "2026-09-01T12:00:00.000Z", drawn_at: null,
      is_pinned: false,
    },
    {
      id: "solo-movie-2", bowl_id: "solo-bowl-2", title: "Solo Two Pick", tmdb_id: -12,
      added_by: "user-smoke", added_at: "2026-09-01T12:00:00.000Z", drawn_at: null,
      is_pinned: false,
    }
  );
}

test("a solo draw commits to history and leaves the bowl untouched", async ({ page, backend }) => {
  await backend.authenticate(page);
  seedTwoBowls(backend);

  await page.goto("/bowl/solo-bowl-1");
  await page.getByRole("button", { name: "Draw for myself" }).click();
  await expect(page).toHaveURL(/\/solo-draw\?bowl=solo-bowl-1/);

  // Arriving from a bowl starts scoped to it, so the pick can only be its title.
  await expect(page.getByRole("button", { name: "Solo One, 1 title" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Solo Two, 1 title" })).toHaveAttribute("aria-pressed", "false");

  // The hold gesture is pointer-only, so keyboard activation opens the same
  // confirm dialog the dashboard uses.
  await page.getByRole("button", { name: /Press and hold to draw/i }).press("Enter");
  await page.getByRole("button", { name: "Draw", exact: true }).click();

  const reveal = page.getByRole("dialog");
  await expect(reveal.getByText("Solo One Pick")).toBeVisible();
  await expect(reveal.getByText("Saved to your watch history.")).toBeVisible();
  // No acceptance, redraw or removal on the reveal: it is already committed.
  await expect(reveal.getByRole("button", { name: /again|keep|remove/i })).toHaveCount(0);
  await reveal.getByRole("button", { name: "Close" }).click();

  // The bowl is exactly as it was, so the group's night is untouched.
  const soloMovie = backend.state.bowl_movies.find((movie) => movie.id === "solo-movie-1");
  expect(soloMovie.drawn_at).toBeNull();
  expect(backend.state.bowl_draw_events).toHaveLength(0);

  await page.goto("/watch-list");
  const entry = page.getByRole("button").filter({ hasText: "Solo One Pick" });
  await expect(entry).toBeVisible();
  await expect(entry.getByText("Solo", { exact: true })).toBeVisible();
});

test("watch history can remove the bowl copies of a solo draw", async ({ page, backend }) => {
  await backend.authenticate(page);
  seedTwoBowls(backend);

  await page.goto("/watch-list");
  await page.getByRole("link", { name: "Draw for myself" }).click();
  await expect(page).toHaveURL(/\/solo-draw$/);
  // From the personal surface the scope is every bowl.
  await expect(page.getByRole("button", { name: "Solo One, 1 title" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Solo Two, 1 title" })).toHaveAttribute("aria-pressed", "true");

  // The hold gesture is pointer-only, so keyboard activation opens the same
  // confirm dialog the dashboard uses.
  await page.getByRole("button", { name: /Press and hold to draw/i }).press("Enter");
  await page.getByRole("button", { name: "Draw", exact: true }).click();

  const reveal = page.getByRole("dialog");
  const drawnTitle = await reveal.getByRole("heading", { level: 2 }).innerText();
  await reveal.getByRole("button", { name: "Close" }).click();

  await page.goto("/watch-list");
  await page.getByRole("button").filter({ hasText: drawnTitle }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Edit history" }).click();
  await page.getByRole("button", { name: "Remove from my bowls…" }).click();

  // Custom titles carry a negative synthetic tmdb_id, so this offer can only
  // find the copy through the row the draw recorded.
  const removeButton = page.getByRole("button", { name: /^Remove from Solo/ });
  await expect(removeButton).toBeVisible();
  await removeButton.click();

  await expect
    .poll(() => backend.state.bowl_movies.filter((movie) => movie.title === drawnTitle).length)
    .toBe(0);
});

// With automatic removal on, the draw empties the bowls and undo is the only
// way back -- the one flow where the two actions in watch history stop meaning
// the same thing.
test("automatic removal empties the bowls at reveal and undo puts them back", async ({ page, backend }) => {
  await backend.authenticate(page);
  seedTwoBowls(backend);
  backend.state.bowl_movies.push({
    id: "solo-movie-3", bowl_id: "solo-bowl-2", title: "Solo One Pick", tmdb_id: 3300,
    added_by: "user-smoke", added_at: "2026-09-01T12:00:00.000Z", drawn_at: null,
    is_pinned: false,
  });
  backend.state.bowl_movies.find((movie) => movie.id === "solo-movie-1").tmdb_id = 3300;

  // The Settings toggle that writes this is covered by its own tests; what only
  // a browser can show is what the draw then does to the bowls.
  backend.state.profiles[0].remove_from_bowls_on_solo_draw = true;

  await page.goto("/solo-draw?bowl=solo-bowl-1");
  const drawButton = page.getByRole("button", { name: /Press and hold to draw/i });
  await expect(drawButton).toBeEnabled();
  await drawButton.press("Enter");
  await expect(page.getByRole("dialog", { name: "Draw a movie for yourself?" })).toBeVisible();
  await page.getByRole("button", { name: "Draw", exact: true }).click();

  // Both copies of the title go, including the one in a bowl outside the scope.
  const reveal = page.getByRole("dialog");
  await expect(reveal.getByText(/2 copies were removed from your bowls/)).toBeVisible();
  await reveal.getByRole("button", { name: "Close" }).click();

  await expect
    .poll(() => backend.state.bowl_movies.filter((movie) => movie.tmdb_id === 3300).length)
    .toBe(0);

  // The pool the draw came from is still on screen behind the reveal, and a
  // copy the server has already taken must not still be offered as a candidate
  // until someone refreshes.
  const pool = page.getByRole("list", { name: "Movies in selected bowls" });
  await expect(pool.getByText("Solo One Pick")).toHaveCount(0);
  await expect(pool.getByText("Solo Two Pick")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Solo One,/ })).toHaveCount(0);

  await page.goto("/watch-list");
  await page.getByRole("button").filter({ hasText: "Solo One Pick" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Edit history" }).click();
  await page.getByRole("button", { name: "Undo draw" }).click();
  await expect(
    page.getByText("Undo this draw? The 2 copies it removed go back to your bowls.")
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo draw" }).click();

  await expect
    .poll(() => backend.state.bowl_movies.filter((movie) => movie.tmdb_id === 3300).length)
    .toBe(2);
  expect(backend.state.user_watch_events).toHaveLength(0);
});

test("solo redesign keeps scope counts, filters and dialog focus usable", async ({ page, backend }) => {
  await backend.authenticate(page);
  seedTwoBowls(backend);
  backend.state.bowl_movies[0].runtime = 95;
  backend.state.bowl_movies[1].runtime = 180;
  await page.goto("/solo-draw");
  await expect(page.getByText("Drawing from 2 of 2 of your titles")).toBeVisible();
  await expect(page.getByRole("heading", { name: "In your pool" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Press and hold to draw/i })).toBeEnabled();
  await page.screenshot({ path: `test-results/solo-redesign-${test.info().project.name}.png`, fullPage: true });

  await page.getByRole("button", { name: "Solo Two, 1 title" }).click();
  await expect(page.getByRole("button", { name: "All bowls 2" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("list", { name: "Movies in selected bowls" })).not.toContainText("Solo Two Pick");
  await page.getByRole("button", { name: "All bowls 2" }).click();

  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const filters = page.getByRole("dialog", { name: "Narrow the draw" });
  await filters.getByRole("button", { name: "Runtime filter", exact: true }).click();
  await filters.getByLabel("Maximum minutes").fill("120");
  await expect(filters).toContainText("Drawing from 1 of 2 of your titles");
  await expect.poll(() => backend.state.profiles[0].default_draw_settings?.runtimeMaxMinutes).toBe(120);
  await page.screenshot({ path: `test-results/solo-filters-${test.info().project.name}.png`, fullPage: true });
  await filters.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeFocused();

  await page.reload();
  await expect(page.getByText("Drawing from 1 of 2 of your titles")).toBeVisible();
  await page.getByRole("button", { name: "How solo draw picks" }).click();
  await expect(page.getByRole("dialog")).toContainText("Your pinned movies go first");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "How solo draw picks" })).toBeFocused();

  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "Runtime filter", exact: true }).click();
  await page.getByLabel("Maximum minutes").fill("50");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /Press and hold to draw/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Adjust filters" })).toBeVisible();
  await page.getByRole("button", { name: "Adjust filters" }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Drawing from 2 of 2 of your titles");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /Press and hold to draw/i })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
