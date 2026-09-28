import { expect, test } from "./support/fakeBackend";

for (const scenario of [
  { name: "web title crowd", tv: false, pinned: false },
  { name: "web pinned crowd", tv: false, pinned: true },
  { name: "TV title crowd", tv: true, pinned: false },
]) {
  test(`solo reveals the ${scenario.name} before opening the saved result`, async ({ page, backend }, testInfo) => {
    test.skip(scenario.tv && testInfo.project.name === "mobile-chromium", "TV uses the desktop browser.");
    const mobile = testInfo.project.name === "mobile-chromium";
    if (scenario.tv) await page.setViewportSize({ width: 1920, height: 1080 });
    else if (scenario.pinned) await page.setViewportSize(mobile ? { width: 568, height: 320 } : { width: 844, height: 390 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await backend.authenticate(page);
    for (const id of ["solo-one", "solo-two"]) {
      backend.state.bowls.push({ id, name: id, owner_id: "user-smoke", draw_access_mode: "all_members", draw_method: "rotation" });
      backend.state.bowl_members.push({ id: `member-${id}`, bowl_id: id, user_id: "user-smoke", role: "Owner" });
    }
    const title = "A Very Long Movie Title for Tonight";
    backend.state.bowl_movies.push(...[
      { id: "a", bowl_id: "solo-one", tmdb_id: 601 },
      { id: "b", bowl_id: "solo-two", tmdb_id: 601, is_pinned: scenario.pinned },
      { id: "c", bowl_id: "solo-one", tmdb_id: 602 },
      { id: "d", bowl_id: "solo-two", tmdb_id: -3 },
    ].map((row) => ({ title, added_by: "user-smoke", added_at: "2026-09-01T12:00:00.000Z", drawn_at: null, ...row })));
    await page.goto(scenario.tv ? "/tv/solo" : "/solo-draw");
    const draw = page.getByRole("button", { name: scenario.tv ? /draw for myself/i : /Press and hold to draw/i });
    await expect(draw).toBeEnabled();
    await draw.press("Enter");
    await expect(page.getByRole("dialog", { name: scenario.tv ? "Pick one of your movies?" : "Draw a movie for yourself?" })).toBeVisible();

    // Observe the readable window every frame, including the final fold and
    // ink animation. Assertion polling can miss a short, completed reveal.
    await page.evaluate(() => {
      window.soloRevealFrames = [];
      let sawHero = false;
      const sample = () => {
        const hero = document.querySelector(".draw-reveal-hero");
        if (hero) {
          sawHero = true;
          const rect = hero.getBoundingClientRect();
          window.soloRevealFrames.push({
            at: performance.now(), opacity: Number(getComputedStyle(hero.querySelector(".draw-reveal-hero-title")).opacity),
            finished: hero.getAnimations({ subtree: true }).every((animation) => animation.playState === "finished"),
            top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
            headerBottom: document.querySelector(".draw-reveal-header").getBoundingClientRect().bottom,
            width: window.innerWidth, height: window.innerHeight,
          });
        }
        if (!sawHero || hero) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.getByRole("button", { name: scenario.tv ? "Reveal one" : "Draw", exact: true }).click();
    const stage = page.locator(".draw-reveal-stage");
    await expect(stage).toHaveAttribute("data-method", "solo");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(stage).toHaveAttribute("data-phase", "arrange");
    await expect(stage.locator(".draw-reveal-count")).toHaveText(scenario.pinned ? "1 title" : "3 titles");
    await expect(stage.locator(".draw-reveal-card")).toHaveCount(0);
    await expect(stage.locator(".draw-reveal-pin")).toHaveCount(scenario.pinned ? 1 : 0);
    await expect(stage.locator(".draw-reveal-steps li")).toHaveCount(1);
    if (scenario.tv) await expect(stage).toHaveClass(/tv-draw-reveal-stage/);

    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible({ timeout: 15_000 });
    const frames = await page.evaluate(() => window.soloRevealFrames);
    const readable = frames.filter((frame) => frame.opacity === 1 && frame.finished);
    expect(readable.length).toBeGreaterThan(1);
    expect(readable.at(-1).at - readable[0].at).toBeGreaterThan(150);
    for (const frame of readable) {
      expect(frame.top).toBeGreaterThanOrEqual(frame.headerBottom);
      expect(frame.bottom).toBeLessThan(frame.height);
      expect(frame.left).toBeGreaterThanOrEqual(0);
      expect(frame.right).toBeLessThanOrEqual(frame.width);
    }
    await expect(stage).toHaveCount(0);
    expect(backend.state.user_watch_events).toHaveLength(1);
    expect(backend.state.user_watch_events[0].source_kind).toBe("solo_draw");
    expect(backend.state.bowl_draw_events).toHaveLength(0);
    if (scenario.tv) await page.keyboard.press("Escape");
    else await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await expect(draw).toBeFocused();
  });
}
