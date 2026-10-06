import { expect, test } from "./support/fakeBackend";

test("a rotation bowl's people list reads in turn order and marks who is up next", async ({ page, backend }) => {
  await backend.authenticate(page);
  backend.state.profiles.push(
    { id: "turn-maya", email: "maya@example.com", display_name: "Maya", streaming_services: [], default_draw_settings: null },
    { id: "turn-jordan", email: "jordan@example.com", display_name: "Jordan", streaming_services: [], default_draw_settings: null },
  );
  backend.state.bowls.push({
    id: "turn-bowl", name: "Turn Night", owner_id: "user-smoke",
    draw_access_mode: "all_members", draw_method: "rotation",
  });
  backend.state.bowl_members.push(
    { id: "turn-owner", bowl_id: "turn-bowl", user_id: "user-smoke", role: "Owner" },
    { id: "turn-maya-member", bowl_id: "turn-bowl", user_id: "turn-maya", role: "Member" },
    { id: "turn-jordan-member", bowl_id: "turn-bowl", user_id: "turn-jordan", role: "Member" },
  );
  backend.state.bowl_movies.push(...[["user-smoke", "Owner Pick"], ["turn-maya", "Maya Pick"], ["turn-jordan", "Jordan Pick"]]
    .map(([userId, title], index) => ({
      id: `turn-movie-${index}`, bowl_id: "turn-bowl", title, tmdb_id: -(index + 1),
      added_by: userId, added_at: "2026-09-01T12:00:00.000Z", drawn_at: null,
    })));
  // Maya was drawn in August and the owner in September; Jordan never has
  // been, so Jordan is next, then Maya, then the owner.
  backend.state.bowl_draw_events.push(
    { id: "turn-event-1", bowl_id: "turn-bowl", title: "Old Maya Pick", tmdb_id: -10, added_by: "turn-maya", drawn_at: "2026-08-01T20:00:00.000Z", drawn_by: "user-smoke", returned_at: null },
    { id: "turn-event-2", bowl_id: "turn-bowl", title: "Old Owner Pick", tmdb_id: -11, added_by: "user-smoke", drawn_at: "2026-09-01T20:00:00.000Z", drawn_by: "user-smoke", returned_at: null },
  );

  await page.goto("/bowl/turn-bowl");
  await page.getByRole("button", { name: "3 people in this bowl. See who." }).click();

  const sheet = page.getByRole("dialog");
  const rows = sheet.getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAccessibleName("Jordan, up next: 1 movie in the draw");
  await expect(rows.nth(1)).toHaveAccessibleName(/^Maya:/);
  await expect(rows.nth(2)).toHaveAccessibleName(/^Smoke Tester \(you\), owner/);
  // The slip sits inside the row, on screen, beside the name.
  await expect(rows.nth(0).locator('[data-method="rotation"]')).toBeInViewport();
  await expect(sheet.locator('[data-method="rotation"]')).toHaveCount(1);
});
