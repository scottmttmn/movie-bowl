import { expect, test } from "./support/fakeBackend";

test("a member can create a bowl, add and draw a title, see history, and return it", async ({
  page,
  backend,
}) => {
  await backend.authenticate(page);
  await page.goto("/bowls");

  await expect(page.getByRole("heading", { name: "My Bowls" })).toBeVisible();
  await page.getByRole("button", { name: /create your first bowl/i }).click();
  await page.getByPlaceholder("Bowl Name").fill("Smoke Night");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  const bowlCard = page.getByRole("button", { name: /Smoke Night/ });
  await expect(bowlCard).toBeVisible();
  await bowlCard.click();

  await expect(page).toHaveURL(/\/bowl\/bowl-1$/);
  await expect(page.getByRole("heading", { name: "Smoke Night", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "+ Add Movie" }).click();
  await page.getByPlaceholder("Search movies...").fill("Smoke Feature");
  await page.getByRole("button", { name: 'Add "Smoke Feature"' }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /1 movies? in the bowl/i })).toBeVisible();

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

  await page.goto("/bowl/bowl-1");
  await expect(page.getByText("1 watched", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await page.getByRole("button", { name: "Smoke Feature" }).click();
  await page.getByRole("button", { name: "Move to Bowl" }).click();
  await expect(page.getByRole("dialog", { name: "Move back to bowl?" })).toBeVisible();
  await page.getByRole("button", { name: "Remove & move back" }).click();

  await expect(page.getByText("0 watched", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /1 movies? in the bowl/i })).toBeVisible();

  expect(backend.state.bowls).toHaveLength(1);
  expect(backend.state.bowl_movies).toHaveLength(1);
  expect(backend.state.bowl_movies[0].drawn_at).toBeNull();
  expect(backend.state.bowl_draw_events[0].returned_at).not.toBeNull();
  expect(backend.state.user_watch_events).toHaveLength(0);
});
