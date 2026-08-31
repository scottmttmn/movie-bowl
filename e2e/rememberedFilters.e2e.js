import { expect, test } from "./support/fakeBackend";
import { DEFAULT_DRAW_SETTINGS } from "../src/utils/drawSettings";

test("filters survive reload and settings edits, and reset leaves playback intact", async ({ page, backend }) => {
  await backend.authenticate(page);
  const profile = backend.state.profiles[0];
  profile.streaming_services = ["Netflix", "Hulu"];
  profile.default_draw_settings = {
    ...DEFAULT_DRAW_SETTINGS, enablePreferredWebLaunch: true,
    theaterModeEnabled: true, theaterTrailerCount: 2,
  };
  backend.state.bowls.push({ id: "filter-bowl", name: "Filter Night", owner_id: "user-smoke", draw_method: "person_first", draw_access_mode: "all_members" });
  backend.state.bowl_members.push({ id: "filter-member", bowl_id: "filter-bowl", user_id: "user-smoke", role: "Owner" });
  backend.state.bowl_movies.push(...[95, 120, 180].map((runtime, index) => ({
    id: `filter-movie-${index}`, bowl_id: "filter-bowl", added_by: "user-smoke",
    title: `Movie ${index + 1}`, tmdb_id: -(index + 1), drawn_at: null,
    runtime, genres: index === 2 ? ["Action"] : ["Comedy"],
  })));
  await page.goto("/bowl/filter-bowl");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const filters = page.getByRole("dialog", { name: "Narrow the draw" });
  await expect(filters.getByRole("button", { name: "Reset" })).toBeEnabled();
  expect(backend.requests.filter((request) => request.method === "PATCH")).toHaveLength(0);
  await expect(filters.getByRole("button", { name: "Done" })).toBeInViewport();
  await filters.getByRole("button", { name: /edit runtime/i }).click();
  await filters.getByLabel("draw-runtime-max", { exact: true }).fill("120");
  await expect(filters.getByText("2 of 3 titles eligible", { exact: true })).toBeVisible();
  await filters.getByRole("button", { name: /edit genres/i }).click();
  await filters.getByRole("button", { name: "Only Comedy", exact: true }).click();
  await filters.locator('label[for="prioritize-streaming-draw"]').click();
  await filters.locator('label[for="use-streaming-rank-draw"]').click();
  await expect(filters.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  await expect(filters.getByRole("button", { name: "Reset" })).toBeInViewport();
  await expect(filters.getByRole("button", { name: "Done" })).toBeInViewport();
  expect(profile.default_draw_settings).toMatchObject({
    runtimeMaxMinutes: 120, selectedGenres: ["Comedy"], prioritizeStreaming: true,
    useStreamingRank: false, enablePreferredWebLaunch: true, theaterModeEnabled: true, theaterTrailerCount: 2,
  });

  await page.reload();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await filters.getByRole("button", { name: /edit runtime/i }).click();
  await expect(filters.getByLabel("draw-runtime-max", { exact: true })).toHaveValue("120");
  await expect(filters.getByRole("checkbox", { name: "Use streaming service ranking", exact: true })).not.toBeChecked();
  await filters.getByRole("button", { name: /edit streaming service ranking/i }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Draw filter defaults" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Settings sections" }).getByRole("link")).toHaveCount(2);
  await page.getByText("Open the service's website for a drawn movie", { exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  expect(profile.default_draw_settings).toMatchObject({
    runtimeMaxMinutes: 120, selectedGenres: ["Comedy"], prioritizeStreaming: true,
    useStreamingRank: false, enablePreferredWebLaunch: false, theaterModeEnabled: true, theaterTrailerCount: 2,
  });

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(filters.getByText("2 of 3 titles eligible", { exact: true })).toBeVisible();
  await filters.getByRole("button", { name: "Reset" }).click();
  await expect(filters.getByRole("status").filter({ hasText: "All changes saved" })).toBeVisible();
  expect(profile.default_draw_settings).toEqual({
    ...DEFAULT_DRAW_SETTINGS, enablePreferredWebLaunch: false, theaterModeEnabled: true, theaterTrailerCount: 2,
  });
  await page.keyboard.press("Escape");
  await expect(filters).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(filters.getByRole("checkbox", { name: "Prioritize streaming services", exact: true })).not.toBeChecked();
  await filters.getByRole("button", { name: /edit runtime/i }).click();
  await expect(filters.getByLabel("draw-runtime-max", { exact: true })).toHaveValue("500");
});
