import { expect, test } from "./support/fakeBackend";

test("settings section jumps preserve both page and browser Back navigation", async ({ page, backend }) => {
  await backend.authenticate(page);
  await page.goto("/bowls");

  for (const useBrowserBack of [false, true]) {
    await page.getByRole("button", { name: "Navigation menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    for (const [label, section] of [["Streaming", "streaming-services"], ["TV playback", "tv-playback"]]) {
      await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: new RegExp(`^${label}`) }).click();
      await expect(page.locator(`#${section}`)).toBeFocused();
      await expect(page).toHaveURL(/\/settings$/);
    }

    if (useBrowserBack) await page.goBack();
    else await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(/\/bowls$/);
    await expect(page.getByRole("heading", { name: "My Bowls" })).toBeVisible();
  }
});

test("bowl settings section jumps preserve both page and browser Back navigation", async ({ page, backend }) => {
  await backend.authenticate(page);
  backend.state.bowls.push({
    id: "bowl-settings",
    name: "Settings Night",
    owner_id: "user-smoke",
    draw_access_mode: "all_members",
    draw_method: "person_first",
    created_at: "2026-08-21T12:00:00.000Z",
  });
  backend.state.bowl_members.push({
    id: "member-settings",
    bowl_id: "bowl-settings",
    user_id: "user-smoke",
    role: "Owner",
  });
  await page.goto("/bowl/bowl-settings");

  for (const useBrowserBack of [false, true]) {
    await page.getByRole("button", { name: "Bowl settings", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Bowl name" })).toBeVisible();

    for (const [label, section] of [["Drawing", "drawing"], ["People", "people"], ["Add links", "add-links"]]) {
      await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: new RegExp(`^${label}`) }).click();
      await expect(page.locator(`#${section}`)).toBeFocused();
      await expect(page).toHaveURL(/\/bowl\/bowl-settings\/settings$/);
    }

    if (useBrowserBack) await page.goBack();
    else await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(/\/bowl\/bowl-settings$/);
    await expect(
      page.getByRole("heading", { name: "Switch bowl. Current bowl: Settings Night" })
    ).toBeVisible();
  }
});
