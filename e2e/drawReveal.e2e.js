import { expect, test } from "./support/fakeBackend";

for (const viewport of [null, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
  test(`the drawn title is readable before the reveal closes${viewport ? ` at ${viewport.width}×${viewport.height}` : ""}`, async ({ page, backend }) => {
    if (viewport) await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    backend.state.bowls.push({
      id: "reveal-bowl", name: "Reveal Night", owner_id: "user-smoke",
      draw_access_mode: "all_members", draw_method: "person_first",
    });
    backend.state.bowl_members.push({ id: "reveal-member", bowl_id: "reveal-bowl", user_id: "user-smoke", role: "Owner" });
    const title = "A Very Long Movie Title for Tonight";
    backend.state.bowl_movies.push(...Array.from({ length: 8 }, (_, index) => ({
      id: `reveal-movie-${index}`, bowl_id: "reveal-bowl", title, tmdb_id: -(index + 1),
      added_by: null, added_by_name: `Guest ${index + 1}`,
      added_at: "2026-09-01T12:00:00.000Z", drawn_at: null,
    })));
    await backend.authenticate(page);
    await page.goto("/bowl/reveal-bowl");
    await expect(page.getByRole("button", { name: /Drawing from 8 titles/ })).toBeVisible();
    const drawButton = page.getByRole("button", { name: /Draw movie from bowl\. Press and hold to draw\./i });
    await expect(drawButton).toBeEnabled();
    await drawButton.press("Enter");
    await expect(page.getByRole("dialog", { name: "Reveal a movie?" })).toBeVisible();

    // Observe real animation frames through the dashboard's unmount: jsdom
    // cannot catch ink hidden by CSS or a slip clipped by its fixed stage.
    await page.evaluate(() => {
      window.revealFrames = [];
      let sawHero = false;
      const sample = () => {
        const hero = document.querySelector(".draw-reveal-hero");
        if (hero) {
          sawHero = true;
          const titleNode = hero.querySelector(".draw-reveal-hero-title");
          const rect = hero.getBoundingClientRect();
          window.revealFrames.push({
            at: performance.now(),
            opacity: Number(getComputedStyle(titleNode).opacity),
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
    await page.getByRole("button", { name: "Reveal Movie" }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible({ timeout: 10_000 });

    const frames = await page.evaluate(() => window.revealFrames);
    const readable = frames.filter((frame) => frame.opacity === 1 && frame.finished);
    expect(readable.length, "the title and folds should finish while the stage is still mounted").toBeGreaterThan(1);
    expect(readable.at(-1).at - readable[0].at, "hold the fully opened title long enough to see it").toBeGreaterThan(150);
    for (const frame of readable) {
      expect(frame.top).toBeGreaterThanOrEqual(frame.headerBottom);
      expect(frame.bottom).toBeLessThan(frame.height);
      expect(frame.left).toBeGreaterThanOrEqual(0);
      expect(frame.right).toBeLessThanOrEqual(frame.width);
    }
  });
}
