import { expect, test } from "./support/fakeBackend";

// One rating per person per movie, on four thumbs. Watch History and a bowl's
// watched movies edit the same rating; in a bowl the others' thumbs stay face
// down until you rate the movie yourself.

function seedFridayNight(backend) {
  const drawnAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { state } = backend;
  state.profiles[0].display_name = "Scott";
  state.profiles.push({ id: "user-robin", email: "robin@example.com", display_name: "Robin", streaming_services: [] });
  state.bowls.push({
    id: "bowl-ratings",
    name: "Friday Night",
    owner_id: "user-smoke",
    draw_access_mode: "all_members",
    draw_method: "person_first",
    created_at: "2026-09-01T12:00:00.000Z",
  });
  state.bowl_members.push(
    { id: "member-scott", bowl_id: "bowl-ratings", user_id: "user-smoke", role: "Owner" },
    { id: "member-robin", bowl_id: "bowl-ratings", user_id: "user-robin", role: "Member" },
  );
  state.bowl_movies.push({
    id: "movie-paris",
    bowl_id: "bowl-ratings",
    tmdb_id: 655,
    title: "Paris, Texas",
    added_by: "user-robin",
    added_at: drawnAt,
    drawn_at: drawnAt,
    drawn_by: "user-smoke",
  });
  state.bowl_draw_events.push({
    id: "draw-paris",
    bowl_id: "bowl-ratings",
    source_bowl_movie_id: "movie-paris",
    tmdb_id: 655,
    title: "Paris, Texas",
    added_by: "user-robin",
    drawn_at: drawnAt,
    returned_at: null,
  });
  ["user-smoke", "user-robin"].forEach((userId) => {
    state.user_watch_events.push({
      id: `watch-paris-${userId}`,
      user_id: userId,
      source_draw_event_id: "draw-paris",
      source_kind: "bowl_draw",
      bowl_name: "Friday Night",
      tmdb_id: 655,
      title: "Paris, Texas",
      release_date: "1984-05-19",
      personal_note: null,
      watched_on: drawnAt.slice(0, 10),
      created_at: drawnAt,
    });
  });
  state.user_movie_ratings.push({ user_id: "user-robin", tmdb_id: 655, watch_event_id: null, rating: 2 });
}

test("a thumb tapped on Watch History is the one the bowl shows, and it turns the bowl's over", async ({ page, backend }) => {
  seedFridayNight(backend);
  await backend.authenticate(page);

  await page.goto("/bowl/bowl-ratings");
  await page.getByRole("button", { name: /^Watched \d+ watched/ }).click();
  await page.locator("#watched").getByRole("button", { name: /Paris, Texas/ }).click();

  const sheet = page.getByRole("dialog", { name: "Paris, Texas" });
  // Robin has rated; what she picked stays face down until Scott rates too.
  await expect(sheet.getByRole("img", { name: "1 in this bowl rated it. Rate to see." })).toBeVisible();
  await expect(sheet.getByTitle("Robin")).toBeVisible();

  await sheet.getByRole("button", { name: "Like", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "Like", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("img", { name: /Rate to see/ })).toHaveCount(0);
  await expect(sheet.getByTitle("Robin")).toBeVisible();
  await expect(sheet.getByTitle("You")).toBeVisible();
  expect(backend.state.user_movie_ratings).toContainEqual(
    expect.objectContaining({ user_id: "user-smoke", tmdb_id: 655, rating: 1 })
  );

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#watched").getByRole("img", { name: "You rated it: Like" })).toBeVisible();

  // The same rating, from the other side.
  await page.goto("/watch-list");
  const thumbs = page.getByRole("group", { name: "Your rating for Paris, Texas" });
  await expect(thumbs.getByRole("button", { name: "Like", exact: true })).toHaveAttribute("aria-pressed", "true");

  await thumbs.getByRole("button", { name: "Love", exact: true }).click();
  await expect(thumbs.getByRole("button", { name: "Love", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => backend.state.user_movie_ratings.find((row) => row.user_id === "user-smoke")?.rating).toBe(2);

  // Tapping the pick again clears it rather than storing a zero.
  await thumbs.getByRole("button", { name: "Love", exact: true }).click();
  await expect(thumbs.getByRole("button", { name: "Love", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => backend.state.user_movie_ratings.some((row) => row.user_id === "user-smoke")).toBe(false);
});

test("the shared history link shows the owner's thumbs only with comments on", async ({ page, backend }) => {
  seedFridayNight(backend);
  backend.state.user_movie_ratings.push({ user_id: "user-smoke", tmdb_id: 655, watch_event_id: null, rating: 2 });
  backend.state.watchShareLinks["user-smoke"] = { token: "ratingsshare00000000000000000000000", include_comments: false };

  await page.goto("/w/ratingsshare00000000000000000000000");
  await expect(page.getByRole("heading", { name: "Paris, Texas" })).toBeVisible();
  await expect(page.getByRole("img", { name: /rated it/ })).toHaveCount(0);

  backend.state.watchShareLinks["user-smoke"].include_comments = true;
  await page.reload();
  await expect(page.getByRole("img", { name: "Scott rated it: Love" })).toBeVisible();
});
