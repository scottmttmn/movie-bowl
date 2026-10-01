import { chromium } from "@playwright/test";
import { FakeBackend, DEFAULT_USER } from "./e2e/support/fakeBackend.js";
const OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function shot(name, viewport, mobile) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  const b = new FakeBackend(); const s = b.state;
  for (const [id, n] of [["priya","Priya"],["dev","Dev"],["casey","Casey"],["jordan","Jordan"]]) s.profiles.push({ id, email: `${id}@example.com`, display_name: n, streaming_services: [], default_draw_settings: null });
  s.bowls.push(
    { id: "friday", name: "Friday Night", owner_id: DEFAULT_USER.id, draw_access_mode: "all_members", draw_method: "person_first", created_at: "2026-08-20T12:00:00.000Z" },
    { id: "family", name: "Family Movie Night", owner_id: DEFAULT_USER.id, draw_access_mode: "all_members", draw_method: "rotation", created_at: "2026-08-22T12:00:00.000Z" },
    { id: "sunday", name: "Sunday Double Feature", owner_id: "priya", draw_access_mode: "all_members", draw_method: "person_first", created_at: "2026-08-20T12:00:00.000Z" },
    { id: "horror", name: "Horror Club", owner_id: "dev", draw_access_mode: "all_members", draw_method: "title_first", created_at: "2026-08-20T12:00:00.000Z" });
  s.bowl_members.push({ id: "m1", bowl_id: "friday", user_id: DEFAULT_USER.id, role: "Owner" }, { id: "m2", bowl_id: "family", user_id: DEFAULT_USER.id, role: "Owner" }, { id: "m3", bowl_id: "friday", user_id: "casey", role: "Member" }, { id: "m4", bowl_id: "friday", user_id: "jordan", role: "Member" });
  const inv = (id, bowl, email, by, at, acc = null) => s.bowl_invites.push({ id, bowl_id: bowl, invited_email: email, invited_by: by, token: `t-${id}`, accepted_at: acc, created_at: at });
  inv("r1", "sunday", DEFAULT_USER.email || "smoke@example.com", "priya", "2026-09-29T12:00:00.000Z");
  inv("r2", "horror", DEFAULT_USER.email || "smoke@example.com", "dev", "2026-09-30T12:00:00.000Z");
  inv("s1", "friday", "maria@example.com", DEFAULT_USER.id, "2026-09-21T12:00:00.000Z");
  inv("s2", "friday", "alex@example.com", DEFAULT_USER.id, "2026-09-28T12:00:00.000Z");
  inv("s3", "family", "grandma@example.com", DEFAULT_USER.id, "2026-09-30T12:00:00.000Z");
  await b.install(page); await b.authenticate(page);
  await page.goto("http://127.0.0.1:4173/invites");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  await context.close();
}
await shot("phone", { width: 390, height: 844 }, true);
await shot("desktop", { width: 1280, height: 900 }, false);
await browser.close();
