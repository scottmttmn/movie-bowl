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
  // Folded to three suggestions until asked for every pack.
  await expect(section.getByRole("group", { name: "Suggested starter packs" })).toBeVisible();
  await section.getByRole("button", { name: "See all packs" }).click();
  const spielberg = section.getByRole("group", { name: "Steven Spielberg decades" });
  await expect(spielberg).toBeVisible();
  await expect(section.locator('img[src="https://image.tmdb.org/t/p/w342/spielberg.jpg"]')).toBeVisible();

  const pour = section.getByRole("button", { name: /Pour into the bowl/ });
  await expect(pour).toBeDisabled();
  // A tap on the card itself chooses the first decade.
  await section.getByRole("button", { name: "Choose Steven Spielberg" }).click();
  await expect(section.getByRole("button", { name: "Spielberg: The '70s" })).toHaveAttribute("aria-pressed", "true");
  await section.getByRole("button", { name: "Spielberg: The '80s" }).click();
  await expect(section.getByText(/Up to 15 of the movies Steven Spielberg directed from 1980 to 1989/)).toBeVisible();
  await expect(pour).toBeEnabled();

  await section.getByRole("button", { name: "Best Picture Winners: The '90s" }).click();
  await expect(section.getByText(/All 10 Best Picture winners from 1990 to 1999/)).toBeVisible();

  // Nothing on the shelf may push the page sideways on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

// Narrower than either project's own viewport: a 360px phone is common, and the
// app shell hides horizontal overflow, so a grid wider than its panel is clipped
// silently rather than scrolled.
test("every Best Picture decade fits on a narrow phone", async ({ page, backend }) => {
  await page.setViewportSize({ width: 360, height: 780 });
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
  await page.goto("/bowl/pack-bowl/settings#starter-pack-all");

  const group = page.getByRole("group", { name: "Best Picture decades" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("button")).toHaveCount(8);
  // Each tile's laurel has to shrink with its column rather than spill past
  // the tile into its neighbour.
  const overflowing = await group.getByRole("button").evaluateAll((buttons) =>
    buttons.filter((button) => button.scrollWidth > button.clientWidth).map((button) => button.getAttribute("aria-label"))
  );
  expect(overflowing).toEqual([]);
});

// The offer an empty bowl makes its owner: pour a pack from the dashboard and
// the bowl has something to draw without a trip to Settings.
test("an empty bowl offers its owner a starter pack and pours it", async ({ page, backend }) => {
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
  backend.state.starterPackPeople = { "Christopher Nolan": "/nolan.jpg" };
  backend.state.starterPackCandidates = {
    "nolan-2000s": [
      { id: 1124, title: "The Prestige", release_date: "2006-10-17", poster_path: null },
      { id: 155, title: "The Dark Knight", release_date: "2008-07-16", poster_path: null },
    ],
  };
  await page.goto("/bowl/pack-bowl");

  const offer = page.getByRole("region", { name: "Nothing to draw yet" });
  await expect(offer).toBeVisible();
  await expect(offer.locator('img[src="https://image.tmdb.org/t/p/w342/nolan.jpg"]')).toBeVisible();
  const pour = offer.getByRole("button", { name: "Pour into the bowl" });
  await expect(pour).toBeDisabled();
  await offer.getByRole("button", { name: "Nolan: The '00s" }).click();
  await expect(offer.getByText(/Up to 15 of the movies Christopher Nolan directed from 2000 to 2009/)).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await pour.click();
  await expect(offer).toBeHidden();
  expect(backend.state.bowl_movies.filter((movie) => movie.starter_pack === "nolan-2000s")).toHaveLength(2);
});
