import { expect, test } from "./support/fakeBackend";

function seed(backend) {
  backend.state.bowls.push({ id: "departure-bowl", name: "Movie Night", owner_id: "user-smoke", draw_method: "person_first", draw_access_mode: "all_members" });
  backend.state.bowl_members.push({ bowl_id: "departure-bowl", user_id: "user-smoke", role: "Owner" });
  backend.state.profiles[0].streaming_services = ["Netflix"];
  backend.state.tmdbSearchResults = [{ id: 77, title: "The Feature", release_date: "2025-04-16", poster_path: "/feature.jpg" }];
  backend.state.tmdbProviders[77] = { results: { US: { flatrate: [{ provider_id: 8, provider_name: "Netflix" }] } } };
  backend.state.titleDepartures[77] = [{ service: "Netflix", expiresOn: null }];
  backend.state.bowl_movies.push({ id: "departure-movie", bowl_id: "departure-bowl", tmdb_id: 77,
    title: "The Feature", poster_path: "/feature.jpg", added_by: "user-smoke", added_at: "2026-10-19T12:00:00Z", drawn_at: null });
}

test("departure notices follow a saved service through search, details and the My Movies card", async ({ page, backend }, testInfo) => {
  seed(backend); await backend.authenticate(page);
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/bowl/departure-bowl");
  // The closed strip does not request departure data.
  await expect(page.getByRole("button", { name: /^My Movies/ })).toBeVisible();
  expect(backend.requests.filter((request) => request.pathname === "/api/title-departures/lookup")).toHaveLength(0);
  await page.getByRole("button", { name: "Add a movie to this bowl" }).click();
  await page.getByPlaceholder("Movie, actor or director").fill("The Feature");
  const add = page.getByRole("dialog", { name: "Add a movie", exact: true });
  await expect(add.getByText("Leaving Netflix soon", { exact: true })).toBeVisible();
  await expect(add.getByRole("link", { name: "Movie of the Night" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("departures-search.png") });
  await page.getByRole("button", { name: "Details for The Feature" }).click();
  await expect(add.getByLabel("The Feature", { exact: true }).getByText("Leaving Netflix soon", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("departures-details.png") });
  await page.getByRole("button", { name: "Close add movie" }).click();
  await page.getByRole("button", { name: /^My Movies/ }).click();
  const card = page.locator(".my-movies-strip article").first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText("Leaving soon", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("departures-card.png") });
  await card.getByRole("button", { name: "Details for The Feature" }).click();
  await expect(page.getByRole("dialog").getByText("Leaving Netflix soon", { exact: true })).toBeVisible();
  expect(backend.requests.filter((request) => request.pathname === "/api/title-departures/lookup")).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("a movie outside the viewer's saved services makes no departure lookup", async ({ page, backend }) => {
  seed(backend); backend.state.profiles[0].streaming_services = ["Hulu"];
  await backend.authenticate(page); await page.goto("/bowl/departure-bowl");
  await page.getByRole("button", { name: "Add a movie to this bowl" }).click();
  await page.getByPlaceholder("Movie, actor or director").fill("The Feature");
  await expect(page.getByText("Netflix", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Details for The Feature" }).click();
  await expect(page.getByRole("heading", { name: "The Feature", exact: true })).toBeVisible();
  await expect(page.getByText(/Leaving Netflix/)).toHaveCount(0);
  expect(backend.requests.filter((request) => request.pathname === "/api/title-departures/lookup")).toHaveLength(0);
});
