import { expect, test } from "./support/fakeBackend";

const BOWL = { id: "bowl-help", name: "Friday Night", draw_access_mode: "all_members", draw_method: "person_first" };

async function seedBowl(backend) {
  backend.state.bowls.push({ ...BOWL, owner_id: "user-smoke" });
  backend.state.bowl_members.push({ id: "member-help", bowl_id: BOWL.id, user_id: "user-smoke", role: "Owner" });
  backend.state.defaults = { "user-smoke": BOWL.id };
}

// The panel drops out of the header, which a backdrop blur makes the
// containing block for anything fixed inside it; only a real layout shows the
// answer's link on screen and clickable on a phone.
test("the ? answers a question and lands on the setting it named", async ({ page, backend }) => {
  await seedBowl(backend);
  backend.state.helpTopics["take a movie out if I watched it alone"] = "solo_draw_removal";
  await backend.authenticate(page);
  await page.goto(`/bowl/${BOWL.id}`);

  await page.getByRole("button", { name: "Help", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Help" });
  await panel.getByRole("textbox", { name: "Question" }).fill("take a movie out if I watched it alone");
  await panel.getByRole("button", { name: "Ask" }).click();
  await expect(panel.getByText("Draw it with Solo draw.", { exact: false })).toBeVisible();
  await panel.getByRole("button", { name: "Solo draw setting" }).click();

  await expect(page).toHaveURL(/\/settings$/);
  const row = page.locator("[data-help-row].help-target");
  await expect(row).toContainText("Remove movies from my bowls when I draw solo");
  await expect(row).toBeInViewport();
});

test("a question with no answer goes to Scott as feedback in one tap", async ({ page, backend }) => {
  await seedBowl(backend);
  await backend.authenticate(page);
  await page.goto(`/bowl/${BOWL.id}`);

  await page.getByRole("button", { name: "Help", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Help" });
  await panel.getByRole("textbox", { name: "Question" }).fill("can it pick a restaurant");
  await panel.getByRole("button", { name: "Ask" }).click();
  await expect(panel.getByText("No answer for that.")).toBeVisible();
  await panel.getByRole("button", { name: "Send as feedback" }).click();

  await expect(panel.getByText("Sent")).toBeVisible();
  expect(backend.state.helpQuestions).toEqual(["can it pick a restaurant"]);
  expect(backend.state.feedbackReports).toEqual([
    expect.objectContaining({ message: "can it pick a restaurant", page: `/bowl/${BOWL.id}` }),
  ]);
});
