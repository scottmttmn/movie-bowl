import { expect, test } from "./support/fakeBackend";

// The shelf is a grid of photo cards whose width depends on the screen, which
// jsdom cannot lay out: this is where a card that overflows a phone shows.
test("the owner picks a starter pack from the photo shelf", async ({ page, backend }) => {
  await backend.authenticate(page);
  backend.state.bowls.push({
    id: "pack-bowl",
    name: "Family Night",
    owner_id: "user-smoke",
    draw_access_mode: "all_members",
    draw_method: "person_first",
    starter_pack: null,
    starter_pack_installed_at: null,
  });
  backend.state.bowl_members.push({ bowl_id: "pack-bowl", user_id: "user-smoke", role: "Owner" });
  backend.state.starterPackPeople = { "Steven Spielberg": "/spielberg.jpg" };
  await page.goto("/bowl/pack-bowl/settings#starter-pack");

  const section = page.locator("#starter-pack");
  const spielberg = section.getByRole("group", { name: "Steven Spielberg decades" });
  await expect(spielberg).toBeVisible();
  await expect(section.locator('img[src="https://image.tmdb.org/t/p/w342/spielberg.jpg"]')).toBeVisible();

  const pour = section.getByRole("button", { name: /Pour into the bowl/ });
  await expect(pour).toBeDisabled();
  await section.getByRole("button", { name: "Spielberg: The '80s" }).click();
  await expect(section.getByText(/Up to 15 of the movies Steven Spielberg directed from 1980 to 1989/)).toBeVisible();
  await expect(pour).toBeEnabled();

  await section.getByRole("button", { name: "Best Picture Winners: The '90s" }).click();
  await expect(section.getByText(/All 10 Best Picture winners from 1990 to 1999/)).toBeVisible();

  // Nothing on the shelf may push the page sideways on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
