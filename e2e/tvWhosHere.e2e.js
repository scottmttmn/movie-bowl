import { expect, test } from "./support/fakeBackend";

const CASEY = ["Alien", "The Thing", "Hereditary", "It Follows", "Halloween", "Midsommar"];

// The television asks who's here in place of its old "Draw a movie?" screen.
// Only a browser can say the faces are reachable with the remote alone: the
// D-pad is geometric, and jsdom has no geometry.
test("the TV asks who's here with the remote, and the draw leaves out whoever is not", async ({ page, backend }, testInfo) => {
  test.skip(testInfo.project.name === "mobile-chromium", "TV smoke coverage uses the desktop viewport.");
  await page.setViewportSize({ width: 1920, height: 1080 });
  const s = backend.state;
  const me = s.currentUser?.id || "user-smoke";
  s.bowls.push({ id: "tv-room", name: "Friday Night", owner_id: me, draw_access_mode: "all_members", draw_method: "person_first" });
  s.bowl_members.push(
    { id: "tv-room-me", bowl_id: "tv-room", user_id: me, role: "Owner" },
    { id: "tv-room-jordan", bowl_id: "tv-room", user_id: "jordan", role: "Member" },
    { id: "tv-room-casey", bowl_id: "tv-room", user_id: "casey", role: "Member" },
  );
  s.profiles.push(
    { id: "jordan", email: "jordan@example.com", display_name: "Jordan", streaming_services: [] },
    { id: "casey", email: "casey@example.com", display_name: "Casey", streaming_services: [] },
  );
  const slip = (id, title, by) => ({
    id, bowl_id: "tv-room", title, tmdb_id: -Number(id.replace(/\D/g, "")), added_by: by,
    added_at: "2026-09-01T12:00:00.000Z", drawn_at: null,
  });
  s.bowl_movies.push(
    slip("t1", "Gran Torino", me),
    slip("t2", "Moonstruck", "jordan"),
    ...CASEY.map((title, index) => slip(`t${index + 3}`, title, "casey")),
  );
  await backend.authenticate(page);
  await page.goto("/tv/bowl/tv-room");

  const draw = page.getByRole("button", { name: /Draw a movie/i });
  await expect(draw).toBeFocused();
  await draw.press("Enter");

  const panel = page.getByRole("dialog", { name: "Who's here?" });
  await expect(panel).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Draw a movie?" })).toHaveCount(0);
  const panelDraw = panel.getByRole("button", { name: "Draw", exact: true });
  await expect(panelDraw).toBeFocused();
  await expect(panel.getByRole("button", { name: /is here/ })).toHaveCount(3);
  if (testInfo.config.metadata?.captureShots) await page.screenshot({ path: "test-results/tv-whos-here-1.png" });

  // Up from Draw reaches the faces, then sideways along the row to Casey.
  // The row's order is the roster's, so walk left first and then right.
  const casey = panel.getByRole("button", { name: "Casey is here" });
  const caseyFocused = () => casey.evaluate((node) => node === document.activeElement);
  await page.keyboard.press("ArrowUp");
  for (const key of ["ArrowLeft", "ArrowRight"]) {
    for (let step = 0; step < 3 && !(await caseyFocused()); step += 1) {
      await page.keyboard.press(key);
    }
  }
  await expect(casey).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(casey).toHaveAttribute("aria-pressed", "false");
  if (testInfo.config.metadata?.captureShots) await page.screenshot({ path: "test-results/tv-whos-here-2.png" });

  await page.keyboard.press("ArrowDown");
  await expect(panelDraw).toBeFocused();
  await page.keyboard.press("Enter");

  await expect.poll(() => s.bowl_movies.filter((movie) => movie.drawn_at).length, { timeout: 10_000 }).toBe(1);
  const drawn = s.bowl_movies.find((movie) => movie.drawn_at);
  expect(["Gran Torino", "Moonstruck"]).toContain(drawn.title);
});
