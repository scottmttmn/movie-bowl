import { expect, test } from "./support/fakeBackend";

// Restaurant bowls stay hidden behind a Settings switch while they are being
// built: off, creating a bowl looks exactly as it always has; on, the create
// dialog offers Restaurants, and that bowl adds by name and draws a place.
test.describe("restaurant bowls", () => {
  test.beforeEach(async ({ page, backend }) => {
    await backend.authenticate(page);
    backend.state.bowls.push({
      id: "bowl-films", name: "Friday Films", owner_id: "user-smoke",
      draw_access_mode: "all_members", draw_method: "person_first",
      created_at: "2026-06-01T12:00:00.000Z",
    });
    backend.state.bowl_members.push({ id: "member-films", bowl_id: "bowl-films", user_id: "user-smoke", role: "Owner" });
  });

  test("are not offered until the account turns them on", async ({ page }) => {
    await page.goto("/bowls");
    await page.getByRole("button", { name: "+ New Bowl" }).click();
    await expect(page.getByRole("dialog", { name: "Create New Bowl" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Kind of bowl" })).toHaveCount(0);
  });

  test("turn on in Settings, then create, add to and draw from a restaurant bowl", async ({ page, backend }) => {
    backend.state.places = [
      { placeId: "ChIJlarana", name: "La Rana Bistro", address: "Water St, Decorah", cuisine: "Mediterranean" },
      { placeId: "ChIJmabes", name: "Mabe's Pizza", address: "W Water St, Decorah", cuisine: "Pizza" },
    ];
    backend.state.placeDetails = {
      ChIJlarana: {
        details: {
          openNow: true,
          nextCloseTime: new Date(Date.now() + 3 * 3_600_000).toISOString(),
          utcOffsetMinutes: 0,
          phone: "+15635550101",
          phoneLabel: "(563) 555-0101",
          website: "https://laranabistro.example/",
          reserveUrl: "https://maps.google.com/?cid=1",
        },
      },
    };
    await page.goto("/settings");
    const toggle = page.getByLabel("Let me create restaurant bowls");
    await expect(toggle).not.toBeChecked();
    // The switch draws over its own checkbox, as every Settings switch does.
    await toggle.check({ force: true });
    await expect.poll(() => backend.state.profiles.find((row) => row.id === "user-smoke")?.restaurant_bowls_enabled).toBe(true);

    await page.goto("/bowls");
    await page.getByRole("button", { name: "+ New Bowl" }).click();
    const create = page.getByRole("dialog", { name: "Create New Bowl" });
    await create.getByPlaceholder("Bowl Name").fill("Date Night Eats");
    await create.getByRole("radio", { name: "Restaurants" }).click();
    await create.getByRole("button", { name: "Create" }).click();
    await expect(create).toHaveCount(0);
    expect(backend.state.bowls.find((row) => row.name === "Date Night Eats")?.kind).toBe("restaurants");

    const bowl = backend.state.bowls.find((row) => row.name === "Date Night Eats");
    await page.goto(`/bowl/${bowl.id}`);
    await page.getByRole("button", { name: "Add a restaurant to this bowl" }).click();
    const add = page.getByRole("dialog", { name: "Add a restaurant" });
    await add.getByLabel("Search for a restaurant").fill("La Rana");
    await add.getByRole("button", { name: "Add La Rana Bistro" }).click();
    // The slip comes prefilled from Google, and the name stays the adder's.
    await expect(add.getByLabel("Restaurant", { exact: true })).toHaveValue("La Rana Bistro");
    await expect(add.getByRole("radio", { name: "Mediterranean" })).toHaveAttribute("aria-checked", "true");
    await add.getByLabel("Restaurant", { exact: true }).fill("La Rana");
    await add.getByRole("button", { name: "Add to Date Night Eats" }).click();
    await expect(add.getByRole("status").filter({ hasText: "Added La Rana" })).toBeVisible();
    expect(backend.state.bowl_movies.find((row) => row.title === "La Rana")).toMatchObject({
      bowl_id: bowl.id, cuisine: "Mediterranean", place_id: "ChIJlarana",
    });
    // Back on search for the next place.
    await expect(add.getByLabel("Search for a restaurant")).toHaveValue("");
    await add.getByRole("button", { name: "Close add restaurant" }).click();

    await expect(page.getByRole("button", { name: "Drawing from 1 restaurant. Open draw filters." })).toBeAttached();
    const drawButton = page.getByRole("button", { name: /Draw restaurant from bowl\. Press and hold to draw\./i });
    await expect(drawButton).toBeEnabled();
    await drawButton.press("Enter");
    await expect(page.getByRole("dialog", { name: "Reveal a restaurant?" })).toBeVisible();
    await page.getByRole("button", { name: "Reveal", exact: true }).click();

    const sheet = page.getByRole("dialog", { name: "La Rana" });
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByRole("link", { name: "Directions" })).toHaveAttribute("href", /query_place_id=ChIJlarana/);
    await expect(sheet.getByRole("link", { name: "Reserve a table" })).toHaveAttribute("href", "https://maps.google.com/?cid=1");
    await expect(sheet.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+15635550101");
    await expect(sheet.getByText(/^Open until/)).toBeVisible();
    await expect(sheet.getByRole("img")).toHaveCount(0);
    expect(backend.state.placeDetailsRequests).toEqual([
      { placeId: "ChIJlarana", bowlId: bowl.id },
    ]);
    expect(backend.state.user_watch_events).toHaveLength(0);
  });

  test("the Open filter leaves out a place that is closed, asking Google once", async ({ page, backend }) => {
    const state = backend.state;
    state.bowls.push({
      id: "bowl-eats", name: "Date Night Eats", kind: "restaurants", owner_id: "user-smoke",
      draw_access_mode: "all_members", draw_method: "person_first", created_at: "2026-06-01T12:00:00.000Z",
    });
    state.bowl_members.push({ id: "member-eats", bowl_id: "bowl-eats", user_id: "user-smoke", role: "Owner" });
    [
      ["Mabe's Pizza", "Pizza", "ChIJmabes"],
      ["Sabin Family Table", "American", "ChIJsabin"],
      ["Taco truck", "Mexican", null],
    ].forEach(([title, cuisine, placeId], index) => state.bowl_movies.push({
      id: `slip-${index}`, bowl_id: "bowl-eats", title, tmdb_id: -(9000 + index), poster_path: null,
      release_date: null, runtime: null, genres: [], cuisine, place_id: placeId, note: null,
      added_by: "user-smoke", added_at: "2026-06-02T12:00:00.000Z", drawn_at: null, is_pinned: false,
    }));
    const hours = (periods) => ({ closedForGood: false, periods, timeZone: null, utcOffsetMinutes: null });
    state.placeHours = {
      // Never closes; closed all week.
      ChIJmabes: hours([{ open: { day: 0, hour: 0, minute: 0 }, close: null }]),
      ChIJsabin: hours([]),
    };

    await page.goto("/bowl/bowl-eats");
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Narrow the draw" });
    await expect(sheet.getByRole("radio", { name: "Any time" })).toBeChecked();
    expect(state.placeHoursRequests).toHaveLength(0);

    await sheet.getByRole("radio", { name: "Now" }).click();
    await expect(sheet.getByText("1 open · 1 closed · 1 without hours")).toBeVisible();
    await expect(sheet.getByText("2 of 3 restaurants in the draw now")).toBeVisible();

    await sheet.getByRole("radio", { name: "Pick" }).click();
    await expect(sheet.getByLabel("Day")).toBeVisible();
    await sheet.getByLabel("Time").selectOption({ label: "12:30 PM" });
    await expect(sheet.getByText("2 of 3 restaurants in the draw tomorrow at 12:30 PM")).toBeVisible();
    // The whole sheet is on screen, Done included, on a phone too.
    await expect(sheet.getByRole("button", { name: "Done" })).toBeInViewport();
    expect(state.placeHoursRequests).toEqual([
      { placeIds: ["ChIJmabes", "ChIJsabin"], bowlId: "bowl-eats" },
    ]);

    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", { name: "Drawing from 2 restaurants. Open draw filters." })).toBeAttached();
  });

  test("a place drawn for a later day can go back in the bowl until that day ends", async ({ page, backend }) => {
    const state = backend.state;
    state.bowls.push({
      id: "bowl-eats", name: "Date Night Eats", kind: "restaurants", owner_id: "user-smoke",
      draw_access_mode: "all_members", draw_method: "person_first", created_at: "2026-06-01T12:00:00.000Z",
    });
    state.bowl_members.push({ id: "member-eats", bowl_id: "bowl-eats", user_id: "user-smoke", role: "Owner" });
    state.bowl_movies.push({
      id: "slip-mabes", bowl_id: "bowl-eats", title: "Mabe's Pizza", tmdb_id: -9100, poster_path: null,
      release_date: null, runtime: null, genres: [], cuisine: "Pizza", place_id: "ChIJmabes", note: null,
      added_by: "user-smoke", added_at: "2026-06-02T12:00:00.000Z", drawn_at: null, is_pinned: false,
    });
    state.placeHours = {
      ChIJmabes: { closedForGood: false, periods: [{ open: { day: 0, hour: 0, minute: 0 }, close: null }], timeZone: null, utcOffsetMinutes: null },
    };

    await page.goto("/bowl/bowl-eats");
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const filters = page.getByRole("dialog", { name: "Narrow the draw" });
    await filters.getByRole("radio", { name: "Pick" }).click();
    await expect(filters.getByText("All 1 restaurant in the draw tomorrow at 7 PM")).toBeVisible();
    await filters.getByRole("button", { name: "Done" }).click();

    await page.getByRole("button", { name: /Draw restaurant from bowl\. Press and hold to draw\./i }).press("Enter");
    await page.getByRole("button", { name: "Reveal", exact: true }).click();
    const drawn = page.getByRole("dialog", { name: "Mabe's Pizza" });
    await expect(drawn).toBeVisible({ timeout: 10_000 });

    // Kept until the midnight that ends tomorrow, on this device's clock.
    const until = await page.evaluate(() => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();
    });
    await expect.poll(() => state.bowl_draw_events[0]?.return_until).toBe(until);
    await drawn.getByRole("button", { name: "Close", exact: true }).click();

    const beenThere = page.getByRole("button", { name: /^Been there/ });
    if ((await beenThere.getAttribute("aria-expanded")) !== "true") await beenThere.click();
    await page.getByRole("button", { name: /^Mabe's Pizza/ }).click();
    const sheet = page.getByRole("dialog", { name: "Mabe's Pizza" });
    await expect(sheet.getByText("It can go back in the bowl until the end of tomorrow.")).toBeVisible();
    await sheet.getByRole("button", { name: "Move to Bowl" }).click();
    await page.getByRole("dialog", { name: "Put it back in the bowl?" }).getByRole("button", { name: "Put it back" }).click();
    await expect(page.getByRole("img", { name: "Nowhere drawn yet" })).toBeVisible();
    expect(state.bowl_draw_events[0].returned_at).toBeTruthy();
  });
});
