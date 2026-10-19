import { readFile, mkdir } from "node:fs/promises";
import { expect, test } from "./support/fakeBackend";

const bowlId = "00000000-0000-4000-8000-000000000080";
const movies = [
  {
    id: 4011,
    title: "The Long Goodbye",
    release_date: "1973-03-07",
    poster_path: "/evolution-1.jpg",
  },
  { id: 4012, title: "Paris, Texas", release_date: "1984-05-19", poster_path: "/evolution-2.jpg" },
  { id: 4013, title: "Local Hero", release_date: "1983-02-17", poster_path: "/evolution-3.jpg" },
  { id: 4014, title: "The Searchers", release_date: "1956-03-13", poster_path: "/evolution-4.jpg" },
];

async function seed(page, backend, { cached = true } = {}) {
  backend.state.bowls.push({
    id: bowlId,
    name: "Friday Night",
    owner_id: "user-smoke",
    draw_method: "person_first",
    draw_access_mode: "all_members",
  });
  backend.state.bowl_members.push({ bowl_id: bowlId, user_id: "user-smoke", role: "Owner" });
  backend.state.profiles[0].streaming_services = ["Netflix"];
  backend.state.tmdbSearchResults = movies;
  for (const movie of movies) {
    backend.state.tmdbProviders[movie.id] = {
      results: { US: { flatrate: [{ provider_id: 8, provider_name: "Netflix" }] } },
    };
    backend.state.bowl_movies.push({
      ...movie,
      id: `departure-${movie.id}`,
      bowl_id: bowlId,
      tmdb_id: movie.id,
      added_by: "user-smoke",
      added_at: "2026-10-19T12:00:00Z",
      drawn_at: null,
    });
  }
  // Demonstration notices, not claims about these real movies' availability.
  backend.state.titleDepartures[4011] = [{ service: "Netflix", expiresOn: "2099-10-31T12:00:00Z" }];
  backend.state.titleDepartures[4012] = [{ service: "Netflix", expiresOn: null }];
  if (cached) backend.state.titleDepartureCache = { ...backend.state.titleDepartures };
  await page.route("https://image.tmdb.org/**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop().replace(".jpg", ".svg");
    if (!/^evolution-[1-4]\.svg$/.test(name)) return route.fallback();
    const body = await readFile(new URL(`./support/poster-fixtures/${name}`, import.meta.url));
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body });
  });
}

async function capture(page, testInfo, surface) {
  // Opt in when refreshing the review artifacts; ordinary CI writes no source files.
  if (process.env.CAPTURE_DEPARTURES !== "1") return;
  const directory = new URL("../output/designs/departure-notices/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const mobile = testInfo.project.name === "mobile-chromium";
  if (surface === "bowl" && mobile) {
    await page.locator(".my-movies-strip").scrollIntoViewIfNeeded();
  }
  await page.screenshot({
    path: new URL(`${testInfo.project.name}-${surface}.png`, directory).pathname,
    scale: "css",
    fullPage: surface === "bowl" && !mobile,
  });
}

test("cached departure notices appear in search, details and a populated My Movies strip", async ({
  page,
  backend,
}, testInfo) => {
  await seed(page, backend);
  await backend.authenticate(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/bowl/${bowlId}`);
  await expect(page.getByRole("button", { name: /^My Movies/ })).toBeVisible();
  expect(
    backend.requests.filter((request) => request.pathname === "/api/title-departures/lookup"),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Add a movie to this bowl" }).click();
  await page.getByPlaceholder("Movie, actor or director").fill("The Long Goodbye");
  const add = page.getByRole("dialog", { name: "Add a movie", exact: true });
  await expect(add.getByText("Expected to leave Netflix Oct 31", { exact: true })).toBeVisible();
  await expect(add.getByRole("link", { name: "Movie of the Night" }).first()).toBeVisible();
  await capture(page, testInfo, "search");
  await page.getByRole("button", { name: "Details for The Long Goodbye" }).click();
  await expect(
    add
      .getByLabel("The Long Goodbye", { exact: true })
      .getByText("Expected to leave Netflix Oct 31", { exact: true }),
  ).toBeVisible();
  await capture(page, testInfo, "search-details");
  expect(backend.state.titleDepartureFetches).toEqual([]);
  await page.getByRole("button", { name: "Close add movie" }).click();
  await page.getByRole("button", { name: /^My Movies/ }).click();
  const card = page.locator(".my-movies-strip article").first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText("Leaving soon", { exact: true })).toBeVisible();
  await expect(card.locator("img")).toHaveJSProperty("complete", true);
  await capture(page, testInfo, "bowl");
  await card.getByRole("button", { name: "Details for The Long Goodbye" }).click();
  await expect(
    page.getByRole("dialog").getByText("Expected to leave Netflix Oct 31", { exact: true }),
  ).toBeVisible();
  await capture(page, testInfo, "saved-details");
  expect(backend.state.titleDepartureFetches.every((id) => [4013, 4014].includes(id))).toBe(true);
  // Only uncached ordinary cards can fetch; search reused existing notices.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test("a search cache miss leaves the budget available for a saved movie", async ({
  page,
  backend,
}) => {
  await seed(page, backend, { cached: false });
  await backend.authenticate(page);
  await page.goto(`/bowl/${bowlId}`);
  await page.getByRole("button", { name: "Add a movie to this bowl" }).click();
  await page.getByPlaceholder("Movie, actor or director").fill("The Long Goodbye");
  await expect(page.getByRole("button", { name: "Details for The Long Goodbye" })).toBeVisible();
  await page.getByRole("button", { name: "Details for The Long Goodbye" }).click();
  await expect(page.getByRole("heading", { name: "The Long Goodbye", exact: true })).toBeVisible();
  await expect(page.getByText(/Expected to leave Netflix/)).toHaveCount(0);
  expect(backend.state.titleDepartureFetches).toEqual([]);
  await page.getByRole("button", { name: "Close add movie" }).click();
  await page.getByRole("button", { name: /^My Movies/ }).click();
  const card = page.locator(".my-movies-strip article").first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText("Leaving soon", { exact: true })).toBeVisible();
  expect(backend.state.titleDepartureFetches).toContain(4011);
  expect(
    backend.requests.find(
      (request) => request.pathname === "/api/title-departures/lookup" && request.body.bowlId,
    )?.body.bowlId,
  ).toBe(bowlId);
});

test("a movie outside the viewer's saved services makes no departure lookup", async ({
  page,
  backend,
}) => {
  await seed(page, backend);
  backend.state.profiles[0].streaming_services = ["Hulu"];
  await backend.authenticate(page);
  await page.goto(`/bowl/${bowlId}`);
  await page.getByRole("button", { name: "Add a movie to this bowl" }).click();
  await page.getByPlaceholder("Movie, actor or director").fill("The Long Goodbye");
  await expect(page.getByRole("button", { name: "Details for The Long Goodbye" })).toBeVisible();
  await page.getByRole("button", { name: "Details for The Long Goodbye" }).click();
  await expect(page.getByRole("heading", { name: "The Long Goodbye", exact: true })).toBeVisible();
  await expect(page.getByText(/Expected to leave Netflix/)).toHaveCount(0);
  expect(
    backend.requests.filter((request) => request.pathname === "/api/title-departures/lookup"),
  ).toHaveLength(0);
});
