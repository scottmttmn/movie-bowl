import { expect, test } from "./support/fakeBackend";

// A Watch History link: one private, read-only page. The viewer gets the same
// calendar without the bowl it came from or anyone else's reason for a slip,
// sees the owner's own comments only when they were switched on, and nothing
// at all once the link is turned off.
test("a shared Watch History shows the calendar, hides bowls, and stops when turned off", async ({
  page,
  backend,
}) => {
  backend.state.profiles[0].display_name = "Scott";
  backend.state.user_watch_events.push(
    {
      id: "watch-paris",
      user_id: "user-smoke",
      source_kind: "bowl_draw",
      bowl_name: "Friday Night",
      tmdb_id: -501,
      title: "Paris, Texas",
      release_date: "1984-05-19",
      note: "Casey swears by it.",
      personal_note: "The phone booth scene.",
      watched_on: "2026-11-08",
      created_at: "2026-11-08T22:00:00.000Z",
    },
    {
      id: "watch-hero",
      user_id: "user-smoke",
      source_kind: "manual",
      bowl_name: null,
      tmdb_id: -502,
      title: "Local Hero",
      release_date: "1983-02-17",
      note: null,
      personal_note: null,
      watched_on: "2026-11-06",
      created_at: "2026-11-06T22:00:00.000Z",
    }
  );
  await backend.authenticate(page);

  await page.goto("/watch-list");
  await expect(page.getByRole("heading", { name: "Paris, Texas" })).toBeVisible();
  await page.getByRole("button", { name: "Share watch history", exact: true }).click();

  const sheet = page.getByRole("dialog", { name: "Share Watch History" });
  await expect(sheet.getByRole("switch", { name: "Show my comments" })).toHaveAttribute("aria-checked", "false");
  await sheet.getByRole("button", { name: "Make a link" }).click();
  const linkField = sheet.getByRole("textbox", { name: "Share link" });
  await expect(linkField).toHaveValue(/\/w\/share1token/);
  // The sheet is on screen and usable, not hanging off a phone.
  await expect(sheet.getByRole("button", { name: "Turn off link" })).toBeInViewport();
  const url = await linkField.inputValue();

  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Share watch history (link on)" })).toBeVisible();

  await page.goto(new URL(url).pathname);
  await expect(page.getByRole("heading", { name: "Scott’s movies" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paris, Texas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local Hero" })).toBeVisible();
  await expect(page.getByText("Friday Night")).toHaveCount(0);
  await expect(page.getByText("Casey swears by it.")).toHaveCount(0);
  await expect(page.getByText("The phone booth scene.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Share watch history", exact: true })).toHaveCount(0);
  // A page of its own: no header, so no way into the owner's app from it.
  await expect(page.getByRole("button", { name: "Help" })).toHaveCount(0);

  // Comments on: the owner's own words appear, and still nobody else's.
  await page.goto("/watch-list");
  await page.getByRole("button", { name: "Share watch history (link on)" }).click();
  await sheet.getByRole("switch", { name: "Show my comments" }).click();
  await expect(sheet.getByRole("switch", { name: "Show my comments" })).toHaveAttribute("aria-checked", "true");
  await expect(linkField).toHaveValue(url);
  await sheet.getByRole("button", { name: "Close" }).click();

  await page.goto(new URL(url).pathname);
  await expect(page.getByText("The phone booth scene.")).toBeVisible();
  await expect(page.getByText("Casey swears by it.")).toHaveCount(0);

  // Off takes two taps, and then the link shows nothing.
  await page.goto("/watch-list");
  await page.getByRole("button", { name: "Share watch history (link on)" }).click();
  await sheet.getByRole("button", { name: "Turn off link" }).click();
  await sheet.getByRole("button", { name: "Tap again to turn off" }).click();
  await expect(sheet.getByRole("button", { name: "Make a link" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  await page.goto(new URL(url).pathname);
  await expect(page.getByText("This link is off")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paris, Texas" })).toHaveCount(0);
});
