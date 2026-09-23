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
  await page.getByPlaceholder("Search movies...").fill("Guest Pick");
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
  await page.getByPlaceholder("Search movies...").fill("Feature");
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
