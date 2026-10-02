import { expect, test } from "./support/fakeBackend";

// Described search, through the add sheet as people use it. The model and
// TMDB are the fake backend's: what matters here is that the sheet shows what
// the model read, lets a term go, and says so when no model answered.
const DESCRIPTION = "space movie where matt damon is stranded";

async function openSearch(page, backend) {
  backend.state.bowls.push({ id: "b1", name: "Friday Night", owner_id: "user-smoke", draw_access_mode: "all_members", draw_method: "person_first" });
  backend.state.defaults = { "user-smoke": "b1" };
  backend.state.tmdbSearchResults = [{ id: 5, title: "Stranded", release_date: "2001-01-01" }];
  await backend.authenticate(page);
  await page.goto("/bowl/b1");
  await page.getByRole("button", { name: "Add to this bowl" }).click();
  await page.getByPlaceholder("Movie, actor or director").fill(DESCRIPTION);
}

test("a described search shows what it read and lets a term go", async ({ page, backend }, testInfo) => {
  backend.state.describedSearch = {
    status: "ok",
    terms: [{ kind: "person", id: 1892, label: "Matt Damon" }, { kind: "genre", id: 878, label: "Science Fiction" }],
    results: [{ id: 286217, title: "The Martian", release_date: "2015-09-30" }, { id: 68724, title: "Elysium", release_date: "2013-08-07" }],
  };
  await openSearch(page, backend);

  const chips = page.getByRole("group", { name: "Searched for" });
  await expect(chips.getByRole("button", { name: "Remove Matt Damon" })).toBeVisible();
  await expect(page.getByRole("row", { name: /The Martian/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Stranded/ })).toHaveCount(0);
  await expect(page.getByTestId("smart-search-ready")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("described.png") });

  backend.state.describedSearch = { status: "ok", terms: [{ kind: "person", id: 1892, label: "Matt Damon" }], results: [{ id: 2501, title: "The Bourne Identity", release_date: "2002-06-14" }] };
  await chips.getByRole("button", { name: "Remove Science Fiction" }).click();
  await expect(page.getByRole("row", { name: /The Bourne Identity/ })).toBeVisible();
  await expect(chips.getByRole("button")).toHaveCount(1);
});

test("a described search with no model says so and shows title results", async ({ page, backend }, testInfo) => {
  backend.state.describedSearch = { status: "unavailable" };
  await openSearch(page, backend);

  await expect(page.getByText("Smart search is resting. Try a title or a name.")).toBeVisible();
  await expect(page.getByTestId("smart-search-unavailable")).toBeVisible();
  await expect(page.getByRole("row", { name: /Stranded/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("resting.png") });
});
