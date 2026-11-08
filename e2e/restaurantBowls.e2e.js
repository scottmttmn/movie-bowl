import { expect, test } from "./support/fakeBackend";

// Restaurant bowls stay hidden behind a Settings switch while they are being
// built: off, creating a bowl looks exactly as it always has; on, the create
// dialog offers Restaurants, and that bowl adds by name and draws a place.
test.describe("restaurant bowls", () => {
  test.beforeEach(async ({ page, backend }) => {
    await backend.authenticate(page);
    backend.state.bowls.push({
      id: "bowl-films", name: "Friday Films", owner_id: "user-smoke",
      draw_access_mode: "all_members", draw_method: "person_first",
      created_at: "2026-06-01T12:00:00.000Z",
    });
    backend.state.bowl_members.push({ id: "member-films", bowl_id: "bowl-films", user_id: "user-smoke", role: "Owner" });
  });

  test("are not offered until the account turns them on", async ({ page }) => {
    await page.goto("/bowls");
    await page.getByRole("button", { name: "+ New Bowl" }).click();
    await expect(page.getByRole("dialog", { name: "Create New Bowl" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Kind of bowl" })).toHaveCount(0);
  });

  test("turn on in Settings, then create, add to and draw from a restaurant bowl", async ({ page, backend }) => {
    await page.goto("/settings");
    const toggle = page.getByLabel("Let me create restaurant bowls");
    await expect(toggle).not.toBeChecked();
    // The switch draws over its own checkbox, as every Settings switch does.
    await toggle.check({ force: true });
    await expect.poll(() => backend.state.profiles.find((row) => row.id === "user-smoke")?.restaurant_bowls_enabled).toBe(true);

    await page.goto("/bowls");
    await page.getByRole("button", { name: "+ New Bowl" }).click();
    const create = page.getByRole("dialog", { name: "Create New Bowl" });
    await create.getByPlaceholder("Bowl Name").fill("Date Night Eats");
    await create.getByRole("radio", { name: "Restaurants" }).click();
    await create.getByRole("button", { name: "Create" }).click();
    await expect(create).toHaveCount(0);
    expect(backend.state.bowls.find((row) => row.name === "Date Night Eats")?.kind).toBe("restaurants");

    const bowl = backend.state.bowls.find((row) => row.name === "Date Night Eats");
    await page.goto(`/bowl/${bowl.id}`);
    await page.getByRole("button", { name: "Add a restaurant to this bowl" }).click();
    const add = page.getByRole("dialog", { name: "Add a restaurant" });
    await add.getByLabel("Restaurant", { exact: true }).fill("La Rana Bistro");
    await add.getByRole("radio", { name: "Mediterranean" }).click();
    await add.getByRole("button", { name: "Add to Date Night Eats" }).click();
    await expect(add.getByRole("status").filter({ hasText: "Added La Rana Bistro" })).toBeVisible();
    expect(backend.state.bowl_movies.find((row) => row.title === "La Rana Bistro")).toMatchObject({
      bowl_id: bowl.id, cuisine: "Mediterranean",
    });
    await add.getByRole("button", { name: "Close add restaurant" }).click();

    await expect(page.getByText("Drawing from 1 restaurant.")).toBeAttached();
    const drawButton = page.getByRole("button", { name: /Draw movie from bowl\. Press and hold to draw\./i });
    await expect(drawButton).toBeEnabled();
    await drawButton.press("Enter");
    await expect(page.getByRole("dialog", { name: "Reveal a restaurant?" })).toBeVisible();
    await page.getByRole("button", { name: "Reveal", exact: true }).click();

    const sheet = page.getByRole("dialog", { name: "La Rana Bistro" });
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByRole("link", { name: "Directions" })).toHaveAttribute("href", /google\.com\/maps\/search/);
    expect(backend.state.user_watch_events).toHaveLength(0);
  });
});
