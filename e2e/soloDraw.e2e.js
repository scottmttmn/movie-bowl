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
  await reveal.getByRole("button", { name: "Done" }).click();

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
  const drawnTitle = await reveal.getByRole("heading").innerText();
  await reveal.getByRole("button", { name: "Done" }).click();

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
