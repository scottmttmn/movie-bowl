import { expect, test } from "./support/fakeBackend";

// The delete shortcut on a My Movies poster has been reworked three times, and
// the thing that keeps going wrong is when it is visible rather than what it
// does. These assert the pointer-device half, which a browser can actually
// observe. The touch half -- that the shortcut is absent entirely -- cannot be
// asserted here: Playwright reports (hover: hover) even under the Pixel 5
// descriptor, and CDP media emulation does not override it. What makes hiding
// it safe on touch is the delete in the details, so that is covered instead.
test.describe("My Movies card actions", () => {
  test.beforeEach(async ({ page, backend }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-chromium",
      "The hover reveal is a pointer-device behavior, and this project reports (hover: hover) regardless."
    );
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

  test("keeps the delete shortcut off the poster until the pointer is on the card", async ({ page }) => {
    const poster = page.getByRole("button", { name: "Details for Card Feature" });
    await expect(poster).toBeVisible();

    const shortcut = page.getByRole("button", { name: 'Delete "Card Feature" from this bowl' });
    await expect(shortcut).toHaveCSS("opacity", "0");
    await expect(shortcut).toHaveCSS("pointer-events", "none");

    await poster.hover();
    await expect(shortcut).toHaveCSS("opacity", "1");
    await expect(shortcut).toHaveCSS("pointer-events", "auto");
  });

  test("reveals the shortcut for the keyboard too, since focus is how it arrives there", async ({ page }) => {
    const shortcut = page.getByRole("button", { name: 'Delete "Card Feature" from this bowl' });
    await expect(shortcut).toHaveCSS("opacity", "0");

    await page.getByRole("button", { name: "Details for Card Feature" }).focus();
    await expect(shortcut).toHaveCSS("opacity", "1");
  });

  // The reason the shortcut is allowed to hide at all.
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
