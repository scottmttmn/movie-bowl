import { expect, test } from "./support/fakeBackend";

// /quick-add is where Android sends the home-screen "Add a movie" shortcut and
// anything shared into Movie Bowl (public/manifest.webmanifest). Both land on
// the home bowl with the add sheet open, a share already searched.
function seed(backend) {
  backend.state.bowls.push(...["Friday Night", "Family Movies"].map((name, index) => ({
    id: `quick-bowl-${index}`, name, owner_id: "user-smoke",
    draw_access_mode: "all_members", draw_method: "person_first",
  })));
  backend.state.defaults = { "user-smoke": "quick-bowl-1" };
  backend.state.tmdbSearchResults = [{ id: 77, title: "Sinners", release_date: "2025-04-16" }];
}
const search = (page) => page.getByPlaceholder("Movie, actor or director");

test("a share opens the home bowl's add sheet already searching, once", async ({ page, backend }, testInfo) => {
  seed(backend); await backend.authenticate(page);
  const shared = new URLSearchParams({ title: "Sinners (2025) - IMDb", text: "https://www.imdb.com/title/tt31193180/" });
  await page.goto(`/quick-add?${shared}`);

  await expect(page).toHaveURL(/\/bowl\/quick-bowl-1$/);
  await expect(page.getByRole("dialog", { name: "Add a movie" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Family Movies/ }).first()).toBeVisible();
  await expect(search(page)).toHaveValue("Sinners");
  await expect(page.getByRole("row", { name: /Sinners/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("quick-add-share.png") });

  // Closing it and reloading the bowl is an ordinary visit, not another share.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add a movie" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Add to this bowl" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Add a movie" })).toHaveCount(0);
});

test("the home-screen shortcut opens an empty add sheet on the home bowl", async ({ page, backend }) => {
  seed(backend); await backend.authenticate(page);
  await page.goto("/quick-add");

  await expect(page).toHaveURL(/\/bowl\/quick-bowl-1$/);
  await expect(page.getByRole("dialog", { name: "Add a movie" })).toBeVisible();
  await expect(search(page)).toHaveValue("");
});

test("signed out, a share goes through login first", async ({ page }) => {
  await page.goto("/quick-add?title=Sinners");
  await expect(page).toHaveURL(/\/login$/);
});
