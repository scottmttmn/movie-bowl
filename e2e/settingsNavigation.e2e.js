import { expect, test } from "./support/fakeBackend";

test("settings section jumps preserve both page and browser Back navigation", async ({ page, backend }) => {
  await backend.authenticate(page);
  await page.goto("/bowls");

  for (const useBrowserBack of [false, true]) {
    await page.getByRole("button", { name: "Navigation menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

    for (const [label, section] of [["Streaming", "streaming-services"], ["Previews", "playback"]]) {
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

// Settings has no bowl of its own, so the header is the only way back to one.
test("the settings header names the home bowl and switches from it", async ({ page, backend }) => {
  await backend.authenticate(page);
  backend.state.bowls.push(...["Friday Night", "Family Movies"].map((name, index) => ({
    id: `header-bowl-${index}`,
    name,
    owner_id: "user-smoke",
    draw_access_mode: "all_members",
    draw_method: "person_first",
  })));
  backend.state.defaults = { "user-smoke": "header-bowl-0" };
  await page.goto("/settings");

  const switchBowl = page.getByRole("button", { name: "Switch bowl. Home bowl: Friday Night" });
  await expect(switchBowl).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to your home bowl" })).toHaveCount(0);

  await switchBowl.click();
  // Nothing here is the bowl in view, so the picker offers no way to move Home.
  await expect(page.getByRole("button", { name: /my home bowl$/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Family Movies,/ }).click();
  await expect(page).toHaveURL(/\/bowl\/header-bowl-1$/);

  // On a bowl the dashboard carries its own picker, so the wordmark returns.
  await expect(page.getByRole("link", { name: "Go to your home bowl" })).toBeVisible();
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

// Only a real layout can tell: jsdom measures nothing, so a tile that runs past
// its card passes every unit test. The Account tile carries the address itself.
test("a long account email stays inside its settings tile", async ({ page, backend }) => {
  const email = "someone.with.a.rather.long.address977@example.com";
  await backend.authenticate(page, { ...backend.state.currentUser, email });
  await page.goto("/settings");

  const tile = page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: /^Account/ });
  await expect(tile).toContainText(email);
  const overflow = await tile.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
