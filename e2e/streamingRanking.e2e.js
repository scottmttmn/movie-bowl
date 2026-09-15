import { expect, test } from "./support/fakeBackend";

test("service ranking supports direct positioning and saves across reloads", async ({ page, backend }, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await backend.authenticate(page);
  backend.state.profiles[0].streaming_services = ["Netflix", "Hulu", "Disney+", "Paramount+"];
  await page.goto("/settings");
  const ranking = page.getByRole("list", { name: "Streaming service ranking" });
  await expect(ranking).toBeVisible();
  await page.getByRole("combobox", { name: "Position of Paramount+" }).selectOption({ value: "0" });
  await expect(ranking.getByRole("listitem").first()).toContainText("Paramount+");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await page.reload();
  await expect(ranking.getByRole("listitem").first()).toContainText("Paramount+");
  if (testInfo.project.name === "mobile-chromium") {
    await page.getByRole("combobox", { name: "Position of Paramount+" }).selectOption({ value: "1" });
  } else {
    await page.getByRole("button", { name: "Move Paramount+ down" }).click();
  }
  await expect(ranking.getByRole("listitem").nth(1)).toContainText("Paramount+");
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await page.getByText("Add services", { exact: false }).click();
  await page.getByRole("textbox", { name: "Search streaming services" }).fill("Peacock");
  await page.locator('label[for="streaming-service-peacock"]').click();
  await expect(ranking.getByRole("listitem").last()).toContainText("Peacock");
  await page.getByText("Add services", { exact: false }).click();
  if (testInfo.project.name === "mobile-chromium") await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("status")).toContainText("All changes saved");
  await page.locator("#streaming-services").screenshot({
    path: testInfo.outputPath("streaming-ranking.png"),
    style: "header, nav { visibility: hidden !important; }",
  });
  expect(errors).toEqual([]);
});
