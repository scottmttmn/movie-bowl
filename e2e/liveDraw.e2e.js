import { expect, test } from "./support/fakeBackend";

test("a draw on a phone plays on the television open on the same bowl", async ({ page, context, backend }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "One phone and one television are both opened here.");
  backend.state.bowls.push({
    id: "live-bowl", name: "Live Night", owner_id: "user-smoke",
    draw_access_mode: "all_members", draw_method: "title_first",
  });
  backend.state.bowl_members.push({ id: "live-member", bowl_id: "live-bowl", user_id: "user-smoke", role: "Owner" });
  backend.state.bowl_movies.push(...["Heat", "Ronin", "Thief"].map((title, index) => ({
    id: `live-movie-${index}`, bowl_id: "live-bowl", title, tmdb_id: -(index + 1),
    added_by: null, added_by_name: `Guest ${index + 1}`,
    added_at: "2026-09-01T12:00:00.000Z", drawn_at: null,
  })));
  await backend.authenticate(page);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/tv/bowl/live-bowl");
  await expect(page.getByRole("button", { name: /Draw a movie/i })).toBeFocused();

  const phone = await context.newPage();
  await backend.install(phone);
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto("/bowl/live-bowl");

  // The phone knows the television is listening before anyone draws.
  const drawButton = phone.getByRole("button", { name: /It will play on the TV too/ });
  await expect(drawButton).toBeEnabled();
  await drawButton.press("Enter");
  await phone.getByRole("button", { name: /reveal movie/i }).click();

  const stage = page.locator(".tv-draw-reveal-stage");
  await expect(stage).toBeVisible();
  await expect(stage.getByTestId("draw-reveal-drawn-by")).toHaveText("Smoke Tester");

  // Both screens land on the same movie, the one the phone drew.
  const drawn = backend.state.bowl_movies.find((movie) => movie.drawn_at);
  await expect(page.getByRole("heading", { name: drawn.title })).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByRole("heading", { name: drawn.title, level: 2 })).toBeVisible({ timeout: 15_000 });
  await expect(stage).toHaveCount(0);

  expect(backend.realtime.broadcasts).toEqual([
    expect.objectContaining({
      topic: "realtime:bowl-live:live-bowl",
      event: "draw",
      payload: expect.objectContaining({ bowlMovieId: drawn.id, drawnBy: "Smoke Tester" }),
    }),
  ]);
  await phone.close();
});
