import { expect, test } from "./support/fakeBackend";
import { getContributorBucketKey } from "../src/utils/drawBuckets";

for (const method of ["person_first", "rotation", "title_first"]) {
  test(`the TV replays ${method} and hands remote focus back after its reveal`, async ({ page, backend }, testInfo) => {
    test.skip(testInfo.project.name === "mobile-chromium", "TV smoke coverage uses the desktop viewport.");
    const viewport = method === "rotation" ? { width: 1280, height: 720 } : { width: 1920, height: 1080 };
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await backend.authenticate(page);
    backend.state.bowls.push({
      id: "tv-reveal", name: "TV Reveal Night", owner_id: "user-smoke",
      draw_access_mode: "all_members", draw_method: method,
    });
    backend.state.bowl_members.push({ id: "tv-reveal-member", bowl_id: "tv-reveal", user_id: "user-smoke", role: "Owner" });
    const title = "A Very Long Movie Title for Tonight";
    const pool = Array.from({ length: 20 }, (_, index) => ({
      id: `tv-reveal-${index}`, bowl_id: "tv-reveal", title, tmdb_id: -(index + 1),
      added_by: null, added_by_name: `Guest ${Math.floor(index / 2) + 1}`,
      added_at: "2026-09-01T12:00:00.000Z", drawn_at: null,
      is_pinned: index % 2 === 0,
    }));
    backend.state.bowl_movies.push(...pool);
    backend.state.rotationDraw = {
      bowl_movie_id: pool[18].id,
      turn_bucket_key: getContributorBucketKey(pool[18]),
      rotation_queue: pool.filter((_, index) => index % 2 === 0).reverse().map((movie) => ({
        bucket_key: getContributorBucketKey(movie), never_drawn: true,
      })),
    };
    await page.goto("/tv/bowl/tv-reveal");
    const draw = page.getByRole("button", { name: /Draw a movie/i });
    await expect(draw).toBeEnabled();
    await expect(draw).toBeFocused();
    await draw.press("Enter");
    await expect(page.getByRole("dialog", { name: "Reveal one movie?" })).toBeVisible();
    // Sample each browser frame: the fully opened title is intentionally brief,
    // so Playwright's assertion polling can skip its readable window.
    await page.evaluate(() => {
      window.tvRevealFrames = [];
      window.tvRevealClosedAt = null;
      let sawHero = false;
      const observer = new MutationObserver(() => {
        if (sawHero && !document.querySelector(".draw-reveal-hero")) {
          window.tvRevealClosedAt = performance.now();
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const sample = () => {
        const hero = document.querySelector(".draw-reveal-hero");
        if (hero) {
          sawHero = true;
          const rect = hero.getBoundingClientRect();
          const animations = hero.getAnimations({ subtree: true });
          window.tvRevealFrames.push({
            at: performance.now(),
            opacity: Number(getComputedStyle(hero.querySelector(".draw-reveal-hero-title")).opacity),
            finished: animations.every((animation) => animation.playState === "finished"),
            finishedAt: Math.max(...animations.map((animation) => Number(animation.startTime) + animation.effect.getComputedTiming().endTime)),
            top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width,
            headerBottom: document.querySelector(".draw-reveal-header").getBoundingClientRect().bottom,
          });
        }
        if (!sawHero || hero) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.getByRole("button", { name: "Reveal a movie" }).press("Enter");
    const stage = page.locator(".tv-draw-reveal-stage");
    await expect(stage).toHaveAttribute("data-method", method);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    await expect(stage).toHaveAttribute("data-phase", "arrange");
    if (method === "title_first") {
      await expect(stage.locator(".draw-reveal-card")).toHaveCount(0);
      await expect(stage.locator(".draw-reveal-count")).toHaveText("20 movies");
    } else {
      await expect(stage.locator(".draw-reveal-card")).toHaveCount(8);
      await expect(stage.locator(".draw-reveal-card-name").last()).toHaveText("+3");
      const tagSize = await stage.locator(".draw-reveal-card-name").first().evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
      expect(tagSize).toBeGreaterThanOrEqual(viewport.width === 1920 ? 36 : 24);
      if (method === "rotation") {
        await expect(stage).toHaveAttribute("data-phase", "lineup");
        await expect(stage.locator(".draw-reveal-card.is-active")).toHaveCount(0);
        await expect(stage.locator(".draw-reveal-card.is-chosen")).toContainText("Guest 10");
      }
    }
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible({ timeout: 15_000 });
    const { frames, closedAt } = await page.evaluate(() => ({ frames: window.tvRevealFrames, closedAt: window.tvRevealClosedAt }));
    const readable = frames.filter((frame) => frame.opacity === 1 && frame.finished);
    expect(readable.length, "the ink and folds finish before the TV stage closes").toBeGreaterThan(1);
    // Measure the actual hold, including intervals between sampled frames.
    expect(closedAt - readable[0].finishedAt, "the TV holds the fully opened title").toBeGreaterThan(150);
    for (const frame of readable) {
      expect(frame.width).toBeGreaterThan(viewport.width === 1920 ? 650 : 440);
      expect(frame.top).toBeGreaterThanOrEqual(frame.headerBottom);
      expect(frame.bottom).toBeLessThan(viewport.height);
      expect(frame.left).toBeGreaterThanOrEqual(0);
      expect(frame.right).toBeLessThanOrEqual(viewport.width);
    }
    await expect(stage).toHaveCount(0);
    expect(backend.state.bowl_draw_events).toHaveLength(1);
    await page.keyboard.press("Escape");
    await expect(draw).toBeFocused();
    await expect(page.getByRole("heading", { name: "TV Reveal Night", exact: true })).toBeVisible();
  });
}
