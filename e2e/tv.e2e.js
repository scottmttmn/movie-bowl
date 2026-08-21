import { expect, test } from "./support/fakeBackend";

test("the signed-out TV route shows pairing instead of the standard login", async ({
  page,
  backend,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "TV smoke coverage uses the desktop viewport.");

  await page.goto("/tv");

  await expect(page.getByRole("heading", { name: "Connect Movie Bowl" })).toBeVisible();
  await expect(page.getByText("ABCD-2345")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Login" })).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(backend.requests).toContainEqual(
    expect.objectContaining({ method: "POST", pathname: "/api/tv-pairing/start" })
  );
});

test("a paired TV can use remote selection to open a bowl", async ({ page, backend }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "TV smoke coverage uses the desktop viewport.");

  await backend.authenticate(page);
  backend.state.bowls.push({
    id: "bowl-tv",
    name: "Smoke TV",
    owner_id: "user-smoke",
    draw_access_mode: "all_members",
    draw_method: "person_first",
    created_at: "2026-08-21T12:00:00.000Z",
  });
  backend.state.bowl_members.push({
    id: "member-tv",
    bowl_id: "bowl-tv",
    user_id: "user-smoke",
    role: "Owner",
  });
  backend.state.bowl_movies.push({
    id: "movie-tv",
    bowl_id: "bowl-tv",
    tmdb_id: -100,
    title: "TV Smoke Feature",
    added_by: "user-smoke",
    added_by_name: null,
    added_at: "2026-08-21T12:00:00.000Z",
    drawn_at: null,
    genres: ["Drama"],
    runtime: 100,
  });

  await page.goto("/tv/bowls");

  await expect(page.getByRole("heading", { name: "Choose a bowl" })).toBeVisible();
  const bowlButton = page.getByRole("button", { name: /Smoke TV/ });
  await expect(bowlButton).toBeFocused();
  await bowlButton.press("Enter");

  await expect(page).toHaveURL(/\/tv\/bowl\/bowl-tv$/);
  await expect(page.getByRole("heading", { name: /Let the bowl decide/i })).toBeVisible();
  await page.getByRole("button", { name: /Draw a movie/ }).press("Enter");
  await expect(page.getByRole("dialog", { name: "Reveal one movie?" })).toBeVisible();
  await page.getByRole("button", { name: "Reveal a movie" }).press("Enter");
  await expect(page.getByRole("heading", { name: "TV Smoke Feature" })).toBeVisible({
    timeout: 15_000,
  });
});
