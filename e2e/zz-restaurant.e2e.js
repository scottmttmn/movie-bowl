import { test } from "./support/fakeBackend";

const SEEDED = "2026-10-20T12:00:00.000Z";
const MODE = process.env.RB_MODE || "before";
const OUT = "/tmp/claude-0/rb/shots";
const MINE = [
  ["La Rana Bistro", "Mediterranean", "", "Anniversary spot"],
  ["Sabin Family Table", "American", "", ""],
  ["Great Dragon", "Chinese", "", "Takeout night"],
];
const FRIEND = [
  ["Mabe's Pizza", "Pizza", "", "Since 1972"],
  ["Rubaiyat", "American", "https://resy.com/cities/decorah/rubaiyat", ""],
  ["El Mezcal", "Mexican", "", ""],
  ["Toppling Goliath Taproom", "Pub", "", ""],
];
const VISITED = [["McCaffrey's Dolce Vita", "Italian", "", ""], ["Pulpit Rock Brewing", "Pub", "", ""]];

test.setTimeout(240_000);
test("restaurant mock", async ({ page, backend }, testInfo) => {
  const me = backend.state.currentUser?.id || "user-smoke";
  const s = backend.state;
  s.profiles[0].display_name = "Scott";
  s.bowls.push({ id: "b1", name: "Date Night Eats", kind: "restaurant", owner_id: me, draw_access_mode: "all_members", draw_method: "person_first", created_at: SEEDED });
  s.bowl_members.push({ id: "m1", bowl_id: "b1", user_id: me, role: "Owner" }, { id: "m2", bowl_id: "b1", user_id: "friend", role: "Member" });
  s.profiles.push({ id: "friend", email: "robin@example.com", display_name: "Robin", streaming_services: [], default_draw_settings: null });
  s.defaults = { [me]: "b1" };
  let n = 0;
  const row = ([title, cuisine, reserve, note], by) => {
    n += 1;
    return { id: `r${n}`, bowl_id: "b1", title, tmdb_id: -(9000 + n), poster_path: null, release_date: null, runtime: null, genres: [], cuisine, reservable: title === "La Rana Bistro", website: "https://example.com", phone: "5633827532", note: note || null, added_by: by, added_at: SEEDED, drawn_at: null, is_pinned: false };
  };
  s.bowl_movies.push(...MINE.map((r) => row(r, me)), ...FRIEND.map((r) => row(r, "friend")));
  VISITED.forEach((v, k) => {
    const r = { ...row(v, k ? "friend" : me), drawn_at: `2026-11-0${5 - k * 3}T01:00:00.000Z`, drawn_by: me };
    s.bowl_movies.push(r);
    s.bowl_draw_events.push({ ...r, id: `draw${k}`, source_bowl_movie_id: r.id, returned_at: null, removed_at: null });
  });
  // Person-first lands on La Rana: Scott's pile, first slip.
  await page.addInitScript(() => { let i = 0; const seq = [0.1, 0.1, 0.1]; Math.random = () => seq[i++ % seq.length]; });
  await backend.authenticate(page);
  const tag = testInfo.project.name.startsWith("mobile") ? "phone" : "desktop";
  const shot = (name, opts = {}) => page.screenshot({ path: `${OUT}/${MODE}-${tag}-${name}.png`, ...opts });
  await page.goto("/bowl/b1");
  await page.waitForTimeout(2500);
  await shot("1-bowl");
  const mine = page.getByRole("button", { name: /^My (Movies|Restaurants)/ }).first();
  if (await mine.count()) { await mine.click(); await page.waitForTimeout(500); }
  const panel = page.locator("section.my-movies-panel");
  await panel.scrollIntoViewIfNeeded();
  const been = page.getByRole("button", { name: /Been there/ }).first();
  if (await been.count()) { await been.click(); await page.waitForTimeout(500); }
  await page.evaluate(() => { const el = document.querySelector("section.my-movies-panel"); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - (window.innerWidth < 700 ? 90 : 420)); });
  await page.waitForTimeout(400);
  await shot("2-slips");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Filters", exact: true }).first().click();
  await page.waitForTimeout(600);
  if (MODE !== "before") { await page.getByRole("radio", { name: "Pick" }).click(); await page.getByRole("button", { name: /Draw cuisine Pub/ }).first().click().catch(() => {}); await page.waitForTimeout(300); }
  await shot("3-filters");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const close = page.getByRole("button", { name: /Hide filters|Close/ }).first();
  if (await close.isVisible().catch(() => false)) { await close.click().catch(() => {}); await page.waitForTimeout(300); }
  await page.getByRole("button", { name: /to this bowl$/ }).first().click();
  await page.waitForTimeout(800);
  if (MODE !== "before") {
    await page.getByLabel("Search restaurants").fill("Ma");
    await page.waitForTimeout(300);
  }
  await shot("4-add");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click().catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Press and hold to draw/i }).press("Enter");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /^Reveal/ }).click({ timeout: 10000 });
  await page.waitForTimeout(10600);
  await shot("6-drawn");
});
