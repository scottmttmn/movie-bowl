import { expect, test } from "./support/fakeBackend";

// The My Movies card carries no controls of its own beyond the pin: the poster
// opens the movie, and deleting happens in what it opens. A card-level shortcut
// existed briefly and was removed -- on touch the tap that revealed it was the
// same tap that covered it, and on a pointer it duplicated an action one click
// away. These cover the path that remains.
test.describe("My Movies card actions", () => {
  test.beforeEach(async ({ page, backend }) => {
    await backend.authenticate(page);
    backend.state.bowls.push({
      id: "bowl-cards",
      name: "Card Night",
      owner_id: "user-smoke",
      draw_access_mode: "all_members",
      draw_method: "person_first",
      created_at: "2026-06-01T12:00:00.000Z",
    });
    backend.state.bowl_members.push({
      id: "member-cards",
      bowl_id: "bowl-cards",
      user_id: "user-smoke",
      role: "Owner",
    });
    backend.state.bowl_movies.push({
      id: "movie-card",
      bowl_id: "bowl-cards",
      tmdb_id: -400,
      title: "Card Feature",
      added_by: "user-smoke",
      added_by_name: "Sam",
      added_at: "2026-06-15T12:00:00.000Z",
      drawn_at: null,
    });
    await page.goto("/bowl/bowl-cards");
  });

  test("carries no delete of its own on the card", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Details for Card Feature" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Delete/ })).toHaveCount(0);
  });

  test("offers delete in the movie's details, which the poster opens", async ({ page, backend }) => {
    page.on("dialog", (dialog) => dialog.accept());

    await page.getByRole("button", { name: "Details for Card Feature" }).click();
    await expect(page.getByRole("heading", { name: "Card Feature" })).toBeVisible();

    await page
      .getByRole("dialog")
      .getByRole("button", { name: 'Delete "Card Feature" from this bowl' })
      .click();

    await expect(page.getByRole("heading", { name: "Card Feature" })).toHaveCount(0);
    expect(backend.state.bowl_movies).toHaveLength(0);
  });
});
