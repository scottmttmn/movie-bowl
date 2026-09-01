import { expect, test } from "./support/fakeBackend";

function seed(backend, names = ["Friday Night", "Family Movies"]) {
  backend.state.bowls.push(...names.map((name, index) => ({
    id: `default-bowl-${index}`, name, owner_id: "user-smoke",
    draw_access_mode: "all_members", draw_method: "person_first",
  })));
  backend.state.defaults = { "user-smoke": "default-bowl-0" };
}
const chooseButton = (page) => page.getByRole("button", { name: /^Choose bowl\. Current bowl:/ });
async function addCustom(page, title) {
  await page.getByPlaceholder("Search movies...").fill(title);
  await page.getByRole("button", { name: `Add "${title}"`, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: `Added ${title} to ` })).toBeVisible();
  await expect(page.getByPlaceholder("Search movies...")).toHaveValue("");
  await expect(page.getByPlaceholder("Search movies...")).toBeFocused();
}

test("stars persist while global and contextual adds use their intended destinations", async ({ page, backend }) => {
  seed(backend); await backend.authenticate(page); await page.goto("/bowls");
  await page.getByRole("button", { name: "Make Family Movies my default bowl" }).click();
  await expect(page).toHaveURL(/\/bowls$/);
  await expect(page.getByRole("button", { name: "Default bowl: Family Movies" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Default bowl: Family Movies" })).toBeVisible();
  await page.getByRole("link", { name: "Go to your default bowl" }).click();
  await expect(page).toHaveURL(/\/bowl\/default-bowl-1$/);
  await page.goto("/bowl/default-bowl-0");
  await page.getByRole("button", { name: "Add a movie", exact: true }).click();
  await expect(chooseButton(page)).toHaveText(/Family Movies/);
  await addCustom(page, "Global Feature");
  await page.getByRole("button", { name: "Close add movie" }).click();
  await expect(page.getByRole("button", { name: "Add a movie", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Add to this bowl" }).click();
  await expect(chooseButton(page)).toHaveText(/Friday Night/);
  await addCustom(page, "Context Feature");
  await chooseButton(page).click();
  await page.getByRole("button", { name: "Family Movies Default" }).click();
  await addCustom(page, "Temporary Feature");
  await addCustom(page, "Another Feature");
  await page.getByRole("button", { name: "Close add movie" }).click();
  await expect(page.getByRole("button", { name: "Add to this bowl" })).toBeFocused();
  expect(backend.state.defaults["user-smoke"]).toBe("default-bowl-1");
  expect(backend.state.bowl_movies.map((movie) => [movie.title, movie.bowl_id])).toEqual([
    ["Global Feature", "default-bowl-1"], ["Context Feature", "default-bowl-0"],
    ["Temporary Feature", "default-bowl-1"], ["Another Feature", "default-bowl-1"],
  ]);
});

test("five bowls scroll above search and remain usable in narrow, short viewports", async ({ page, backend }, testInfo) => {
  seed(backend, ["Friday Night", "Family Movies", "Animation", "Documentaries", "Weekend Movies"]);
  await backend.authenticate(page); await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/bowls");
  await page.getByRole("button", { name: "Add a movie", exact: true }).click();
  await chooseButton(page).click();
  const options = page.locator("#add-bowl-choices");
  await expect(options).toBeVisible();
  expect(await options.evaluate((node) => node.scrollHeight > node.clientHeight && node.clientHeight <= 224)).toBe(true);
  const optionBox = await options.boundingBox();
  const searchBox = await page.getByPlaceholder("Search movies...").boundingBox();
  expect(searchBox.y).toBeGreaterThanOrEqual(optionBox.y + optionBox.height);
  await page.screenshot({ path: testInfo.outputPath("selector-320.png") });
  await options.getByRole("button", { name: "Weekend Movies", exact: true }).click();
  await expect(chooseButton(page)).toHaveText(/Weekend Movies/);
  await chooseButton(page).click();
  await expect(options.getByRole("button", { name: "Weekend Movies", exact: true })).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Escape");
  await expect(options).toHaveCount(0);
  await expect(chooseButton(page)).toBeFocused();
  await expect(page.getByRole("dialog", { name: "Add a movie" })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 400 });
  await chooseButton(page).click();
  await expect(page.getByPlaceholder("Search movies...")).toBeInViewport();
  await expect(page.getByRole("button", { name: "Close add movie" })).toBeInViewport();
  expect(await page.locator(".bowl-add-surface").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("selector-short-320.png") });
});

test("movie details preserve search on Back, and comments are added after the movie", async ({ page, backend }, testInfo) => {
  seed(backend); backend.state.tmdbSearchResults = [{ id: 42, title: "The Feature", release_date: "2026-01-01" }];
  await backend.authenticate(page); await page.goto("/bowls");
  await page.getByRole("button", { name: "Add a movie", exact: true }).click();
  await page.getByPlaceholder("Search movies...").fill("Feature");
  await expect(page.getByRole("button", { name: "Comment (optional)" })).toHaveCount(0);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add to Friday Night", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to search" })).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("add-details.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder("Search movies...")).toHaveValue("Feature");
  await expect(page.getByPlaceholder("Search movies...")).toBeFocused();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page.getByRole("button", { name: "Add to Friday Night", exact: true }).click();
  await expect(page.getByPlaceholder("Search movies...")).toHaveValue("");
  await expect(page.getByPlaceholder("Search movies...")).toBeFocused();
  expect(backend.state.bowl_movies[0]).toMatchObject({ bowl_id: "default-bowl-0", tmdb_id: 42, note: null });
  await page.getByRole("button", { name: /Added this session/ }).click();
  await page.getByRole("button", { name: "Add comment for The Feature" }).click();
  await page.getByRole("textbox", { name: "Comment for The Feature" }).fill("Save this comment");
  await page.getByRole("button", { name: "Save comment", exact: true }).click();
  await expect(page.getByText("Save this comment", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit comment for The Feature" })).toBeFocused();
  expect(backend.state.bowl_movies[0].note).toBe("Save this comment");
});

test("closing and reopening during an insert keeps one operation and the original destination", async ({ page, backend }) => {
  seed(backend); await backend.authenticate(page); await page.goto("/bowl/default-bowl-1");
  let release; let inserting = false;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/rest/v1/bowl_movies?*", async (route) => {
    if (route.request().method() === "POST") { inserting = true; await gate; }
    await route.fallback();
  });
  await page.getByRole("button", { name: "Add to this bowl" }).click();
  await page.getByPlaceholder("Search movies...").fill("Slow Feature");
  await page.getByRole("button", { name: 'Add "Slow Feature"' }).click();
  await expect.poll(() => inserting).toBe(true);
  await page.getByRole("button", { name: "Close add movie" }).click();
  await page.getByRole("button", { name: "Add a movie", exact: true }).click();
  await expect(page.getByPlaceholder("Search movies...")).toHaveValue("Slow Feature");
  await expect(chooseButton(page)).toHaveText(/Family Movies/);
  await expect(chooseButton(page)).toBeDisabled();
  await page.getByRole("button", { name: "Close add movie" }).click();
  release();
  await expect(page.getByRole("status").filter({ hasText: "Added Slow Feature to Family Movies" })).toBeVisible();
  expect(backend.state.bowl_movies).toHaveLength(1);
  expect(backend.state.bowl_movies[0].bowl_id).toBe("default-bowl-1");
});

test("losing the destination preserves the draft and requires an explicit replacement", async ({ page, backend }) => {
  seed(backend); await backend.authenticate(page); await page.goto("/bowls");
  await page.getByRole("button", { name: "Add a movie", exact: true }).click();
  await page.getByPlaceholder("Search movies...").fill("Saved Draft");
  backend.state.bowls[0].owner_id = "someone-else";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("alert")).toContainText("You no longer have access");
  await expect(page.getByPlaceholder("Search movies...")).toHaveValue("Saved Draft");
  await expect(page.getByRole("button", { name: 'Add "Saved Draft"' })).toBeDisabled();
  await page.getByRole("button", { name: "Use Family Movies" }).click();
  await page.getByRole("button", { name: 'Add "Saved Draft"' }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added Saved Draft to Family Movies" })).toBeVisible();
  expect(backend.state.bowl_movies[0].bowl_id).toBe("default-bowl-1");
});

test("an account with no bowls gets a clear create-or-join path", async ({ page, backend }) => {
  await backend.authenticate(page); await page.goto("/bowls");
  await page.getByRole("button", { name: "Add a movie", exact: true }).click();
  await expect(page.getByText("Create or join a bowl to add movies.")).toBeVisible();
  await expect(page.getByPlaceholder("Search movies...")).toHaveCount(0);
  await page.getByRole("link", { name: "Go to My Bowls" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "My Bowls" })).toBeVisible();
});

test("long duplicate bowl names stay distinguishable without clipping search", async ({ page, backend }, testInfo) => {
  const name = "Family movie nights with friends and neighbors";
  seed(backend, [name, name, "Friday Night", "Animation", "Documentaries", "Weekend Movies"]);
  await backend.authenticate(page); await page.setViewportSize({ width: 320, height: 400 });
  await page.goto("/bowls");
  await page.getByRole("button", { name: "Add a movie", exact: true }).click();
  await chooseButton(page).click();
  const options = page.locator("#add-bowl-choices");
  await expect(options.getByRole("button", { name: /Family movie nights.*Owner · bowl-0 Default/ })).toBeVisible();
  await expect(options.getByRole("button", { name: /Family movie nights.*Owner · bowl-0 Default/ })).toBeInViewport({ ratio: 1 });
  await expect(options.getByRole("button", { name: /Family movie nights.*Owner · bowl-1/ })).toBeVisible();
  await expect(page.getByPlaceholder("Search movies...")).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Close add movie" })).toBeInViewport({ ratio: 1 });
  expect(await page.locator(".bowl-add-surface").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("selector-long-320.png") });
  await options.getByRole("button", { name: /Family movie nights.*Owner · bowl-1/ }).click();
  await expect(page.getByPlaceholder("Search movies...")).toBeFocused();
  expect(backend.state.defaults["user-smoke"]).toBe("default-bowl-0");
});

test("session additions scroll, retain their bowls, and support comments and confirmed removal", async ({ page, backend }, testInfo) => {
  seed(backend); await backend.authenticate(page); await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/bowl/default-bowl-0");
  await page.getByRole("button", { name: "Add a movie", exact: true }).click();
  await addCustom(page, "The first feature with a very long title that wraps");
  await chooseButton(page).click();
  await page.getByRole("button", { name: "Family Movies", exact: true }).click();
  for (const title of ["Second feature", "Third feature", "Fourth feature", "Fifth feature", "Sixth feature"]) await addCustom(page, title);
  await page.getByRole("button", { name: /Added this session/ }).click();
  const list = page.getByRole("list", { name: "Movies added this session" });
  await expect(list.getByRole("listitem")).toHaveCount(6);
  await expect(list.getByRole("listitem").first()).toContainText("Sixth feature");
  await expect(list.getByRole("listitem").last()).toContainText("Friday Night");
  expect(await page.locator(".bowl-add-scroll:visible").evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  const firstTitle = "The first feature with a very long title that wraps";
  await page.getByRole("button", { name: `Add comment for ${firstTitle}`, exact: true }).click();
  await page.getByRole("textbox", { name: `Comment for ${firstTitle}`, exact: true }).fill("Recommended by Tim at dinner.");
  await expect(page.getByPlaceholder("Search movies...")).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Close add movie" })).toBeInViewport({ ratio: 1 });
  expect(await page.locator(".bowl-add-surface").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Save comment", exact: true }).click();
  await expect(page.getByText("Recommended by Tim at dinner.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Edit comment for ${firstTitle}`, exact: true })).toBeFocused();
  expect(backend.state.bowl_movies.find((movie) => movie.title === firstTitle)).toMatchObject({ bowl_id: "default-bowl-0", note: "Recommended by Tim at dinner." });
  await page.screenshot({ path: testInfo.outputPath("session-added-320.png") });
  await page.getByRole("button", { name: "Remove Sixth feature from Family Movies", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("session-remove-320.png") });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(backend.state.bowl_movies).toHaveLength(6);
  await page.getByRole("button", { name: "Remove Sixth feature from Family Movies", exact: true }).click();
  await page.getByRole("button", { name: "Remove from bowl", exact: true }).click();
  await expect(list).toHaveCount(0);
  await expect(page.getByPlaceholder("Search movies...")).toBeFocused();
  await page.getByRole("button", { name: /Added this session/ }).click();
  await expect(page.getByRole("list", { name: "Movies added this session" }).getByRole("listitem")).toHaveCount(5);
  expect(backend.state.bowl_movies.some((movie) => movie.title === "Sixth feature")).toBe(false);
  await page.getByRole("button", { name: "Close add movie" }).click();
  await expect(page.getByRole("button", { name: "Add a movie", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Add a movie", exact: true }).click();
  await expect(page.getByRole("list", { name: "Movies added this session" })).toHaveCount(0);
  expect(backend.state.bowl_movies).toHaveLength(5);
});

test("a draw on another device prevents comment edits and removal of a session addition", async ({ page, backend }) => {
  seed(backend); await backend.authenticate(page); await page.goto("/bowls");
  await page.getByRole("button", { name: "Add a movie", exact: true }).click();
  await addCustom(page, "Drawn before editing");
  await addCustom(page, "Drawn before removal");
  backend.state.bowl_movies.forEach((movie) => { movie.drawn_at = new Date().toISOString(); });
  await page.getByRole("button", { name: /Added this session/ }).click();
  await page.getByRole("button", { name: "Add comment for Drawn before editing" }).click();
  await page.getByRole("textbox", { name: "Comment for Drawn before editing" }).fill("Keep this draft");
  await page.getByRole("button", { name: "Save comment", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("may already have been drawn");
  await expect(page.getByRole("textbox", { name: "Comment for Drawn before editing" })).toHaveValue("Keep this draft");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Remove Drawn before removal from Friday Night" }).click();
  await page.getByRole("button", { name: "Remove from bowl", exact: true }).click();
  await expect(page.getByText("This movie is no longer available to remove. It may already have been drawn or removed.", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Movies added this session" }).getByRole("listitem")).toHaveCount(2);
  expect(backend.state.bowl_movies).toHaveLength(2);
  expect(backend.state.bowl_movies.every((movie) => movie.note == null)).toBe(true);
  expect(backend.consoleErrors).toEqual(["Failed to load resource: the server responded with a status of 400 (Bad Request)"]);
  backend.consoleErrors.length = 0;
});

test("global Add locks the document and closes after browser navigation", async ({ page, backend }) => {
  seed(backend); await backend.authenticate(page);
  await page.goto("/bowl/default-bowl-0");
  await page.goto("/bowls");
  await page.evaluate(() => {
    document.body.style.minHeight = "2000px";
    window.scrollTo(0, 600);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);
  await page.evaluate(() => document.querySelector('[aria-label="Add a movie"]')?.click());
  await expect(page.getByRole("heading", { name: "Add a movie" })).toHaveClass(/sr-only/);
  expect(await page.evaluate(() => ({
    rootOverflow: document.documentElement.style.overflow,
    rootOverscroll: document.documentElement.style.overscrollBehavior,
    bodyOverflow: document.body.style.overflow,
    bodyOverscroll: document.body.style.overscrollBehavior,
    bodyPosition: document.body.style.position,
    bodyTop: document.body.style.top,
    shellInert: document.querySelector(".app-shell")?.inert,
  }))).toEqual({
    rootOverflow: "hidden",
    rootOverscroll: "none",
    bodyOverflow: "hidden",
    bodyOverscroll: "none",
    bodyPosition: "fixed",
    bodyTop: "-600px",
    shellInert: true,
  });
  await page.getByRole("button", { name: "Close add movie" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(600);
  await page.evaluate(() => document.querySelector('[aria-label="Add a movie"]')?.click());
  await page.goBack();
  await expect(page).toHaveURL(/\/bowl\/default-bowl-0$/);
  await expect(page.getByRole("dialog", { name: "Add a movie" })).toHaveCount(0);
  expect(await page.evaluate(() => ({
    rootOverflow: document.documentElement.style.overflow,
    bodyOverflow: document.body.style.overflow,
    bodyPosition: document.body.style.position,
    shellInert: Boolean(document.querySelector(".app-shell")?.inert),
  }))).toEqual({ rootOverflow: "", bodyOverflow: "", bodyPosition: "", shellInert: false });
});

test("short keyboard-height view prioritizes results and keeps session history compact", async ({ page, backend }, testInfo) => {
  seed(backend);
  backend.state.tmdbSearchResults = [
    { id: 41, title: "First Match", release_date: "2026-01-01" },
    { id: 42, title: "Second Match", release_date: "2025-01-01" },
    { id: 43, title: "Third Match", release_date: "2024-01-01" },
  ];
  await backend.authenticate(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto("/bowls");
  await page.getByRole("button", { name: "Add a movie", exact: true }).click();
  await page.getByPlaceholder("Search movies...").fill("Match");
  const firstResult = page.getByRole("option", { name: /First Match/ });
  await expect(firstResult).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("status").filter({ hasText: "3 results below" })).toHaveClass(/sr-only/);
  await firstResult.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added First Match to Friday Night" })).toBeVisible();
  const sessionButton = page.getByRole("button", { name: /Added this session 1/ });
  await expect(sessionButton).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("list", { name: "Movies added this session" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("add-short-keyboard-height.png") });
});
