import { expect, test } from "./support/fakeBackend";

const CASEY = ["Alien", "The Thing", "Hereditary", "It Follows", "Halloween", "Midsommar"];

// Who's here decides the pool before anything else, and the sheet has to be
// reachable on a phone: only the browser can say the Draw inside it is on
// screen and clickable.
test("a draw leaves out whoever is not here, and Don't ask again brings back the hold", async ({ page, backend }) => {
  const s = backend.state;
  const me = s.currentUser?.id || "user-smoke";
  s.bowls.push({ id: "room", name: "Friday Night", owner_id: me, draw_access_mode: "all_members", draw_method: "person_first" });
  s.bowl_members.push(
    { id: "room-me", bowl_id: "room", user_id: me, role: "Owner" },
    { id: "room-jordan", bowl_id: "room", user_id: "jordan", role: "Member" },
    { id: "room-casey", bowl_id: "room", user_id: "casey", role: "Member" },
  );
  s.profiles.push(
    { id: "jordan", email: "jordan@example.com", display_name: "Jordan", streaming_services: [] },
    { id: "casey", email: "casey@example.com", display_name: "Casey", streaming_services: [] },
  );
  const slip = (id, title, by) => ({
    id, bowl_id: "room", title, tmdb_id: -Number(id.replace(/\D/g, "")), added_by: by,
    added_at: "2026-09-01T12:00:00.000Z", drawn_at: null,
  });
  s.bowl_movies.push(
    slip("m1", "Gran Torino", me),
    slip("m2", "Moonstruck", "jordan"),
    ...CASEY.map((title, index) => slip(`m${index + 3}`, title, "casey")),
  );
  await backend.authenticate(page);
  await page.goto("/bowl/room");

  await page.getByRole("button", { name: "Draw movie from bowl. Choose who's here first." }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Casey is here" }).click();
  await expect(sheet.getByText("2/3")).toBeVisible();
  await sheet.getByRole("button", { name: "Draw", exact: true }).click();

  await expect.poll(() => s.bowl_movies.filter((movie) => movie.drawn_at).length, { timeout: 10_000 }).toBe(1);
  const drawn = s.bowl_movies.find((movie) => movie.drawn_at);
  expect(["Gran Torino", "Moonstruck"]).toContain(drawn.title);
  await expect(page.getByRole("heading", { name: drawn.title, level: 2 })).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Drawing for 2 of 3 people/ }).click();
  await sheet.getByRole("checkbox", { name: "Don't ask again" }).check();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Draw movie from bowl. Press and hold to draw." })).toBeVisible();
});
