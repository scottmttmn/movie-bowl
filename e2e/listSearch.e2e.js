import { expect, test } from "./support/fakeBackend";

const MINE = ["Gran Torino", "Paddington 2", "Arrival", "Heat", "The Mule", "Unforgiven", "Parasite", "Zodiac", "Paris, Texas"];
const HISTORY = [
  ["Alien", "2026-11-14"], ["Fargo", "2026-11-08"], ["Jaws", "2026-10-25"], ["Rushmore", "2026-10-18"], ["Brazil", "2026-09-27"],
  ["Chinatown", "2026-09-20"], ["Heat", "2026-08-30"], ["Aliens", "2025-12-26"], ["Zodiac", "2025-09-06"],
];
const SEEDED = "2026-09-01T12:00:00.000Z";

function seed(backend) {
  const me = backend.state.currentUser?.id || "user-smoke";
  const s = backend.state;
  s.bowls.push({ id: "b1", name: "Friday Night", owner_id: me, draw_access_mode: "all_members", draw_method: "person_first", created_at: SEEDED });
  s.bowl_members.push({ id: "m1", bowl_id: "b1", user_id: me, role: "Owner" });
  s.defaults = { [me]: "b1" };
  s.bowl_movies.push(...MINE.map((title, i) => ({
    id: `mv${i}`, bowl_id: "b1", title, tmdb_id: 5000 + i, poster_path: null, release_date: "2010-01-01",
    runtime: 110, genres: ["Drama"], added_by: me, added_at: SEEDED, drawn_at: null, is_pinned: false,
  })));
  s.user_watch_events.push(...HISTORY.map(([title, day], i) => ({
    id: `watch-l${i}`, user_id: me, source_kind: "manual", bowl_name: null, tmdb_id: 6000 + i, title,
    poster_path: null, release_date: "1990-01-01", runtime: 110, genres: [], note: null, personal_note: null,
    watched_on: day, created_at: `${day}T03:00:00Z`, updated_at: `${day}T03:00:00Z`,
  })));
}

test("narrows My Movies from the magnifier beside its heading", async ({ page, backend }) => {
  seed(backend);
  await backend.authenticate(page);
  await page.goto("/bowl/b1");

  const section = page.locator("#my-movies");
  await section.getByRole("button", { name: /My Movies/ }).click();
  await section.getByRole("button", { name: "Search my movies" }).click();
  await page.keyboard.type("par");

  await expect(section.getByRole("button", { name: /^Details for / })).toHaveCount(2);
  await expect(section.getByRole("button", { name: "Details for Parasite" })).toBeVisible();
  await expect(section.getByRole("button", { name: "Details for Paris, Texas" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(section.getByRole("button", { name: /^Details for / })).toHaveCount(MINE.length);
  await expect(section.getByRole("button", { name: "Search my movies" })).toBeVisible();
});

test("searches Watch History across years", async ({ page, backend }) => {
  seed(backend);
  await backend.authenticate(page);
  await page.goto("/watch-list");

  await page.getByRole("button", { name: "Search watch history" }).click();
  await page.keyboard.type("alien");

  await expect(page.getByRole("heading", { name: "November 2026" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "December 2025" })).toBeVisible();
  await expect(page.getByText("Fargo")).toHaveCount(0);

  await page.getByRole("button", { name: "Close search" }).click();
  await expect(page.getByLabel("Year watched")).toHaveValue("2026");
  await expect(page.getByText("Fargo")).toBeVisible();
});
