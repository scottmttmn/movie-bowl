import { expect, test } from "./support/fakeBackend";

// Described search, through the add sheet as people use it. The model and
// TMDB are the fake backend's: what matters here is that the sheet shows what
// the model found, and says so when no model answered.
const DESCRIPTION = "space movie where matt damon is stranded";

async function openSearch(page, backend) {
  backend.state.bowls.push({ id: "b1", name: "Friday Night", owner_id: "user-smoke", draw_access_mode: "all_members", draw_method: "person_first" });
  backend.state.defaults = { "user-smoke": "b1" };
  backend.state.tmdbSearchResults = [{ id: 5, title: "Stranded", release_date: "2001-01-01" }];
  await backend.authenticate(page);
  await page.goto("/bowl/b1");
  await page.getByRole("button", { name: "Add a movie to this bowl" }).click();
  await page.getByPlaceholder("Movie, actor or director").fill(DESCRIPTION);
}

test("a described search shows what the model found", async ({ page, backend }, testInfo) => {
  backend.state.describedSearch = {
    status: "ok",
    results: [{ id: 286217, title: "The Martian", release_date: "2015-09-30" }, { id: 68724, title: "Elysium", release_date: "2013-08-07" }],
  };
  await openSearch(page, backend);

  await expect(page.getByRole("row", { name: /The Martian/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Stranded/ })).toHaveCount(0);
  await expect(page.getByTestId("smart-search-ready")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("described.png") });
});

test("a described search with no model says so and shows title results", async ({ page, backend }, testInfo) => {
  backend.state.describedSearch = { status: "unavailable" };
  await openSearch(page, backend);

  await expect(page.getByText("Smart search is resting. Try a title or a name.")).toBeVisible();
  await expect(page.getByTestId("smart-search-unavailable")).toBeVisible();
  await expect(page.getByRole("row", { name: /Stranded/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("resting.png") });
});

test("a described search offers the person it named", async ({ page, backend }, testInfo) => {
  backend.state.describedSearch = {
    status: "ok",
    picks: [],
    results: [{ id: 872585, title: "Oppenheimer", release_date: "2023-07-19" }, { id: 155, title: "The Dark Knight", release_date: "2008-07-16" }],
    people: [{ id: 2037, name: "Cillian Murphy", profilePath: null, knownForDepartment: "Acting", knownFor: ["Oppenheimer", "Inception"] }],
  };
  backend.state.tmdbPersonMovies = { 2037: { acting: [{ id: 170, title: "28 Days Later", release_date: "2002-11-01", characters: ["Jim"] }], directing: [] } };
  backend.state.bowls.push({ id: "b1", name: "Friday Night", owner_id: "user-smoke", draw_access_mode: "all_members", draw_method: "person_first" });
  backend.state.defaults = { "user-smoke": "b1" };
  backend.state.tmdbSearchResults = [];
  await backend.authenticate(page);
  await page.goto("/bowl/b1");
  await page.getByRole("button", { name: "Add a movie to this bowl" }).click();
  await page.getByPlaceholder("Movie, actor or director").fill("lead actor in oppenheimer");

  const person = page.getByRole("button", { name: "Show Cillian Murphy’s movies" });
  await expect(person).toBeVisible();
  await expect(page.getByRole("row", { name: /Oppenheimer/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("described-person.png") });

  await person.click();
  await expect(page.getByRole("button", { name: "Details for 28 Days Later" })).toBeVisible();
});
