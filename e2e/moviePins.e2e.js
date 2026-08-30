import { expect, test } from "./support/fakeBackend";

test("movie details can move and remove a saved pin while cards show only poster icons", async ({ page, backend }) => {
  await backend.authenticate(page);
  backend.state.bowls.push({
    id: "pin-bowl", name: "Pin Night", owner_id: "user-smoke",
    draw_access_mode: "all_members", draw_method: "person_first",
  });
  backend.state.bowl_members.push({ id: "pin-member", bowl_id: "pin-bowl", user_id: "user-smoke", role: "Owner" });
  backend.state.bowl_movies.push(...["First Movie", "Second Movie"].map((title, index) => ({
    id: `pin-movie-${index}`, bowl_id: "pin-bowl", title, tmdb_id: -(index + 1),
    added_by: "user-smoke", added_at: "2026-08-30T12:00:00.000Z", drawn_at: null,
    is_pinned: index === 0,
  })));
  await page.goto("/bowl/pin-bowl");

  const firstCard = page.getByRole("article").filter({ hasText: "First Movie" });
  const secondCard = page.getByRole("article").filter({ hasText: "Second Movie" });
  await expect(firstCard.getByRole("button", { name: 'Unpin "First Movie"' })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Pinned", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Up first when you're picked", { exact: true })).toHaveCount(0);

  await secondCard.getByRole("button", { name: "Details" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Pinning another movie replaces your current pin/)).toBeVisible();
  await dialog.getByRole("button", { name: "Pin movie", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Unpin movie", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(secondCard.getByRole("button", { name: 'Unpin "Second Movie"' })).toBeVisible();
  await expect(firstCard.getByRole("button", { name: /Pin "First Movie" so/ })).toHaveAttribute("aria-pressed", "false");

  await page.reload();
  await expect(secondCard.getByRole("button", { name: 'Unpin "Second Movie"' })).toHaveAttribute("aria-pressed", "true");
  await secondCard.getByRole("button", { name: "Details" }).click();
  await dialog.getByRole("button", { name: "Unpin movie", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Pin movie", exact: true })).toHaveAttribute("aria-pressed", "false");
  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await page.reload();
  await expect(secondCard.getByRole("button", { name: /Pin "Second Movie" so/ })).toHaveAttribute("aria-pressed", "false");
  expect(backend.state.bowl_movies.filter((movie) => movie.is_pinned)).toHaveLength(0);
});
