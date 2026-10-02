import { expect, test } from "./support/fakeBackend";

test("an authenticated invite recipient joins the intended bowl", async ({ page, backend }) => {
  await backend.authenticate(page);
  backend.state.profiles.push({
    id: "owner-invite",
    email: "owner@example.com",
    display_name: "Bowl Owner",
    streaming_services: [],
    default_draw_settings: null,
  });
  backend.state.bowls.push({
    id: "bowl-invite",
    name: "Invited Bowl",
    owner_id: "owner-invite",
    draw_access_mode: "all_members",
    draw_method: "person_first",
    created_at: "2026-08-20T12:00:00.000Z",
  });
  backend.state.bowl_members.push({
    id: "member-owner",
    bowl_id: "bowl-invite",
    user_id: "owner-invite",
    role: "Owner",
  });
  backend.state.bowl_invites.push({
    id: "invite-smoke",
    bowl_id: "bowl-invite",
    invited_email: "smoke@example.com",
    invited_by: "owner-invite",
    token: "invite-token-smoke",
    accepted_at: null,
    created_at: "2026-08-21T12:00:00.000Z",
  });

  await page.goto("/accept-invite/invite-token-smoke");

  await expect
    .poll(() =>
      backend.state.bowl_members.some(
        (member) =>
          member.bowl_id === "bowl-invite" && member.user_id === "user-smoke"
      )
    )
    .toBe(true);
  await expect.poll(() => backend.state.bowl_invites[0].accepted_at).not.toBeNull();

  await expect(page).toHaveURL(/\/bowl\/bowl-invite$/);
  await expect(page.getByRole("heading", { name: "Invited Bowl", level: 1 })).toBeVisible();
});

test("a signed-out guest can consume a public add link without production services", async ({
  page,
  backend,
}) => {
  backend.state.bowls.push({
    id: "bowl-public",
    name: "Public Smoke Bowl",
    owner_id: "owner-public",
    draw_access_mode: "all_members",
    draw_method: "person_first",
  });
  backend.state.addLinks["public-token-smoke"] = {
    status: "active",
    bowlId: "bowl-public",
    bowlName: "Public Smoke Bowl",
    remainingAdds: 1,
    defaultContributorName: "Movie Night Guest",
  };

  await page.goto("/add-to-bowl/public-token-smoke");

  await expect(
    page.getByRole("heading", { name: "Add movies to Public Smoke Bowl" })
  ).toBeVisible();
  await expect(page.getByLabel("Added by")).toHaveValue("Movie Night Guest");
  await page.getByPlaceholder("Movie, actor or director").fill("Guest Pick");
  await page.getByRole("button", { name: 'Add "Guest Pick"' }).click();

  await expect(
    page.getByText("Movie added as Movie Night Guest. This link is now used up.")
  ).toBeVisible();
  await expect(page.getByText("This add link has already been used up.")).toBeVisible();
  expect(backend.state.addLinks["public-token-smoke"].remainingAdds).toBe(0);
  expect(backend.state.bowl_movies).toEqual([
    expect.objectContaining({
      bowl_id: "bowl-public",
      title: "Guest Pick",
      added_by: null,
      added_by_name: "Movie Night Guest",
    }),
  ]);
});

test("a guest writes a comment in the movie's details, after choosing it", async ({ page, backend }) => {
  backend.state.bowls.push({
    id: "bowl-public",
    name: "Public Smoke Bowl",
    owner_id: "owner-public",
    draw_access_mode: "all_members",
    draw_method: "person_first",
  });
  backend.state.addLinks["public-token-comment"] = {
    status: "active",
    bowlId: "bowl-public",
    bowlName: "Public Smoke Bowl",
    remainingAdds: 2,
    defaultContributorName: "Movie Night Guest",
  };
  backend.state.tmdbSearchResults = [{ id: 42, title: "The Feature", release_date: "2026-01-01" }];

  await page.goto("/add-to-bowl/public-token-comment");
  await page.getByPlaceholder("Movie, actor or director").fill("Feature");
  await expect(page.getByRole("button", { name: "Details for The Feature", exact: true })).toBeVisible();
  await expect(page.getByLabel("Comment (optional)")).toHaveCount(0);

  await page.getByRole("button", { name: "Details for The Feature", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Comment (optional)").fill("Recommended by Tim at dinner.");
  await dialog.getByRole("button", { name: "Add Movie", exact: true }).click();

  await expect(page.getByText("Movie added as Movie Night Guest. 1 add remaining.")).toBeVisible();
  expect(backend.state.bowl_movies).toEqual([
    expect.objectContaining({
      title: "The Feature",
      note: "Recommended by Tim at dinner.",
      added_by_name: "Movie Night Guest",
    }),
  ]);
});

test("a guest finds a movie through the person in it and adds from their list", async ({ page, backend }, testInfo) => {
  backend.state.bowls.push({
    id: "bowl-public",
    name: "Public Smoke Bowl",
    owner_id: "owner-public",
    draw_access_mode: "all_members",
    draw_method: "person_first",
  });
  backend.state.addLinks["public-token-people"] = {
    status: "active",
    bowlId: "bowl-public",
    bowlName: "Public Smoke Bowl",
    remainingAdds: 2,
    defaultContributorName: "Movie Night Guest",
  };
  backend.state.tmdbSearchResults = [{ id: 42, title: "Hanky Panky", release_date: "1982-06-04" }];
  backend.state.tmdbPeople = [
    { id: 31, name: "Tom Hanks", profilePath: null, knownForDepartment: "Acting", knownFor: ["Cast Away", "Big"] },
  ];
  backend.state.tmdbPersonMovies = {
    31: {
      acting: [
        { id: 8358, title: "Cast Away", release_date: "2000-12-22", characters: ["Chuck Noland"] },
        { id: 2280, title: "Big", release_date: "1988-06-03", characters: ["Josh Baskin"] },
      ],
      directing: [{ id: 9591, title: "That Thing You Do!", release_date: "1996-10-04" }],
    },
  };

  await page.goto("/add-to-bowl/public-token-people");
  await page.getByPlaceholder("Movie, actor or director").fill("tom han");
  const person = page.getByRole("button", { name: "Show Tom Hanks’s movies" });
  await expect(person).toBeVisible();
  await expect(page.getByRole("button", { name: "Details for Hanky Panky" })).toBeVisible();

  await person.click();
  await expect(page.getByText("Tom Hanks’s movies", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Acting" })).toHaveAttribute("aria-selected", "true");
  if (!testInfo.project.name.startsWith("mobile")) {
    // A mouse click hands focus back to the field, so the arrow keys keep
    // working -- after choosing the person and after choosing a role.
    const field = page.getByPlaceholder("Movie, actor or director");
    await expect(field).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(field).toHaveAttribute("aria-activedescendant", "movie-option-2280");
    await page.getByRole("tab", { name: "Directing" }).click();
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("aria-activedescendant", "movie-option-9591");
    await page.getByRole("tab", { name: "Acting" }).click();
  }
  await page.getByRole("button", { name: "Add Cast Away" }).click();

  await expect(page.getByText("Movie added as Movie Night Guest. 1 add remaining.")).toBeVisible();
  await expect(page.getByText("Tom Hanks’s movies", { exact: true })).toBeVisible();
  expect(backend.state.bowl_movies).toEqual([
    expect.objectContaining({ title: "Cast Away", tmdb_id: 8358, added_by_name: "Movie Night Guest" }),
  ]);

  // Editing the query leaves the person for a fresh search.
  await page.getByPlaceholder("Movie, actor or director").fill("tom hank");
  await expect(page.getByRole("button", { name: "Details for Hanky Panky" })).toBeVisible();
  await expect(page.getByText("Tom Hanks’s movies", { exact: true })).toHaveCount(0);
});

test("the invitations hub shows what is waiting and checks addresses as they are typed", async ({ page, backend }) => {
  await backend.authenticate(page);
  backend.state.profiles.push({
    id: "owner-invite",
    email: "owner@example.com",
    display_name: "Priya",
    streaming_services: [],
    default_draw_settings: null,
  });
  backend.state.bowls.push(
    {
      id: "bowl-mine",
      name: "Friday Night",
      owner_id: "user-smoke",
      draw_access_mode: "all_members",
      draw_method: "person_first",
      created_at: "2026-08-20T12:00:00.000Z",
    },
    {
      id: "bowl-theirs",
      name: "Sunday Double Feature",
      owner_id: "owner-invite",
      draw_access_mode: "all_members",
      draw_method: "person_first",
      created_at: "2026-08-20T12:00:00.000Z",
    }
  );
  backend.state.bowl_members.push({ id: "member-mine", bowl_id: "bowl-mine", user_id: "user-smoke", role: "Owner" });
  backend.state.bowl_invites.push(
    {
      id: "invite-received",
      bowl_id: "bowl-theirs",
      invited_email: "smoke@example.com",
      invited_by: "owner-invite",
      token: "invite-token-received",
      accepted_at: null,
      created_at: "2026-08-21T12:00:00.000Z",
    },
    {
      id: "invite-sent",
      bowl_id: "bowl-mine",
      invited_email: "maria@example.com",
      invited_by: "user-smoke",
      token: "invite-token-sent",
      accepted_at: null,
      created_at: "2026-08-21T12:00:00.000Z",
    }
  );

  await page.goto("/invites");

  const slip = page.getByRole("article", { name: "Sunday Double Feature" });
  await expect(slip).toBeVisible();
  await expect(slip.getByText(/^Priya/)).toBeVisible();
  await expect(slip.getByRole("button", { name: "Accept invitation to Sunday Double Feature" })).toBeVisible();

  await expect(page.getByRole("radio", { name: /Friday Night/ })).toBeChecked();
  const field = page.getByLabel("Email addresses");
  await field.fill("jordan@example.com, alex@exmaple sam@example.com");
  await expect(page.getByRole("button", { name: "Remove jordan@example.com" })).toBeVisible();
  await expect(page.getByText("1 address needs fixing before you send.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite 2" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "In the bowl" })).toBeVisible();
  const maria = page.getByRole("button", { name: "maria@example.com, invited" });
  await maria.click();
  await expect(page.getByRole("button", { name: "Revoke invitation for maria@example.com" })).toBeVisible();

  // The chips, the slip and the opened invitation are the widest things here;
  // none may push the page sideways on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
