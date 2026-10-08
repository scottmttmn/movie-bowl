import { expect, test } from "./support/fakeBackend";

// Drags a grip by its centre. On the phone project it is a real touch, sent
// through the DevTools protocol because Playwright has no touch-move API; that
// is the gesture HTML5 drag and drop never answered.
async function dragGrip(page, grip, rows, isTouch, scroll = {}) {
  // Centre the list so the drag stays clear of the edges that scroll the page.
  await grip.evaluate((el) => el.closest("ol").scrollIntoView({ block: "center", behavior: "instant" }));
  scroll.before = await page.evaluate(() => window.scrollY);
  const box = await grip.boundingBox();
  const x = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const endY = startY + rows * ((await grip.evaluate((el) => el.closest("li").getBoundingClientRect().height)) + 8);
  const steps = 12;
  if (!isTouch) {
    await page.mouse.move(x, startY);
    await page.mouse.down();
    for (let i = 1; i <= steps; i += 1) await page.mouse.move(x, startY + ((endY - startY) * i) / steps);
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, y) => cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y }],
  });
  await touch("touchStart", startY);
  for (let i = 1; i <= steps; i += 1) await touch("touchMove", startY + ((endY - startY) * i) / steps);
  await touch("touchEnd", endY);
  await cdp.detach();
}

test("service ranking reorders by dragging the grip and saves across reloads", async ({ page, backend }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const isTouch = testInfo.project.name === "mobile-chromium";
  await backend.authenticate(page);
  backend.state.profiles[0].streaming_services = ["Netflix", "Hulu", "Disney+", "Paramount+"];
  await page.goto("/settings");
  const ranking = page.getByRole("list", { name: "Streaming service ranking" });
  await expect(ranking).toBeVisible();
  const scroll = { before: null };
  await dragGrip(page, ranking.getByRole("button", { name: /^Reorder Paramount\+,/ }), -3, isTouch, scroll);
  await expect(ranking.getByRole("listitem").first()).toContainText("Paramount+");
  // The grip owns a finger's gesture: dragging it must not scroll the page instead.
  if (isTouch) expect(await page.evaluate(() => window.scrollY)).toBe(scroll.before);
  await expect(page.getByRole("status")).toContainText("All changes saved");
  expect(backend.state.profiles[0].streaming_services).toEqual(["Paramount+", "Netflix", "Hulu", "Disney+"]);
  await page.reload();
  await expect(ranking.getByRole("listitem").first()).toContainText("Paramount+");
  await dragGrip(page, ranking.getByRole("button", { name: /^Reorder Paramount\+,/ }), 1, isTouch);
  await expect(ranking.getByRole("listitem").nth(1)).toContainText("Paramount+");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  const grip = ranking.getByRole("button", { name: /^Reorder Paramount\+,/ });
  await grip.focus();
  await page.keyboard.press("End");
  await expect(ranking.getByRole("listitem").last()).toContainText("Paramount+");
  await expect(grip).toBeFocused();
  await page.getByText("Add services", { exact: false }).click();
  await page.getByRole("textbox", { name: "Search streaming services" }).fill("Peacock");
  await page.locator('label[for="streaming-service-peacock"]').click();
  await expect(ranking.getByRole("listitem").last()).toContainText("Peacock");
  await page.getByText("Add services", { exact: false }).click();
  if (isTouch) await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await page.locator("#streaming-services").screenshot({
    path: testInfo.outputPath("streaming-ranking.png"),
    style: "header, nav { visibility: hidden !important; }",
  });
  expect(errors).toEqual([]);
});


test("first-time service selection keeps the picker open until dismissed", async ({ page, backend }) => {
  await backend.authenticate(page);
  backend.state.profiles[0].streaming_services = [];
  await page.goto("/settings");
  const picker = page.locator("#streaming-services details");
  const search = page.getByRole("textbox", { name: "Search streaming services" });
  await expect(picker).toHaveAttribute("open", "");
  await expect(search).toBeVisible();

  for (const service of ["Netflix", "Hulu"]) {
    await page.locator(`label[for="streaming-service-${service.toLowerCase()}"]`).click();
    await expect(page.getByRole("button", { name: new RegExp(`^Reorder ${service},`) })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("All changes saved");
    await expect(picker).toHaveAttribute("open", "");
    await expect(search).toBeVisible();
  }

  await picker.locator("summary").click();
  await expect(search).not.toBeVisible();
  await page.getByRole("button", { name: "Remove Netflix", exact: true }).click();
  await page.getByRole("button", { name: "Remove Hulu", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await expect(search).not.toBeVisible();
  await picker.locator("summary").click();
  await expect(search).toBeVisible();
});
