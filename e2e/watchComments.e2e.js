import { expect, test } from "./support/fakeBackend";

// The two comments on a watched movie: why it was in the bowl, which the bowl
// shares, and what you thought of it, which is yours. Each page leads with its
// own and folds the other away.
test("a comment written on the bowl page is the same one the Watch History leads with", async ({
  page,
  backend,
}) => {
  const drawnAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  backend.state.bowls.push({
    id: "bowl-comments",
    name: "Comment Bowl",
    owner_id: "user-smoke",
    draw_access_mode: "all_members",
    draw_method: "person_first",
    created_at: "2026-09-01T12:00:00.000Z",
  });
  backend.state.bowl_members.push({
    id: "member-comments",
    bowl_id: "bowl-comments",
    user_id: "user-smoke",
    role: "Owner",
  });
  backend.state.bowl_movies.push({
    id: "movie-commented",
    bowl_id: "bowl-comments",
    tmdb_id: -401,
    title: "Sam's Pick",
    note: "Sam swears by it.",
    added_by: "user-smoke",
    added_at: drawnAt,
    drawn_at: drawnAt,
    drawn_by: "user-smoke",
  });
  backend.state.bowl_draw_events.push({
    id: "draw-commented",
    bowl_id: "bowl-comments",
    source_bowl_movie_id: "movie-commented",
    tmdb_id: -401,
    title: "Sam's Pick",
    note: "Sam swears by it.",
    added_by: "user-smoke",
    drawn_at: drawnAt,
    returned_at: null,
  });
  backend.state.user_watch_events.push({
    id: "watch-commented",
    user_id: "user-smoke",
    source_draw_event_id: "draw-commented",
    source_kind: "bowl_draw",
    bowl_name: "Comment Bowl",
    tmdb_id: -401,
    title: "Sam's Pick",
    note: "Sam swears by it.",
    personal_note: null,
    watched_on: drawnAt.slice(0, 10),
    created_at: drawnAt,
  });

  await backend.authenticate(page);
  await page.goto("/bowl/bowl-comments");
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await page.getByRole("button", { name: "Sam's Pick" }).click();

  const bowlDetail = page.getByRole("dialog", { name: "Sam's Pick" });
  await expect(bowlDetail.getByText("Sam swears by it.")).toBeVisible();
  await bowlDetail.getByRole("button", { name: "+ Add your comment" }).click();
  await bowlDetail.getByRole("textbox", { name: "Your comment" }).fill("The ending got me.");
  await bowlDetail.getByRole("button", { name: "Save comment" }).click();
  // The editor closes only once the save has answered; leaving before then
  // would cut the request off.
  await expect(bowlDetail.getByRole("textbox", { name: "Your comment" })).toHaveCount(0);
  await expect(bowlDetail.getByRole("button", { name: "Edit your comment" })).toBeVisible();
  await expect(bowlDetail.getByText("The ending got me.")).toBeVisible();
  expect(backend.state.user_watch_events[0].personal_note).toBe("The ending got me.");
  expect(backend.state.bowl_draw_events[0].note).toBe("Sam swears by it.");

  await page.goto("/watch-list");
  await page.getByRole("button", { name: /Sam's Pick/ }).click();
  const historyDetail = page.getByRole("dialog", { name: "Sam's Pick" });
  await expect(historyDetail.getByText("The ending got me.")).toBeVisible();
  await expect(historyDetail.getByText("Sam swears by it.")).toHaveCount(0);

  await historyDetail.getByRole("button", { name: "Why it was in the bowl" }).click();
  await expect(historyDetail.getByText("Sam swears by it.")).toBeVisible();
});
