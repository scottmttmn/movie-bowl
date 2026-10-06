import { expect, test } from "./support/fakeBackend";

// The sheet is portalled out of the header; only a real layout shows whether
// its Send button is on screen and clickable on a phone.
test("feedback sent from the menu reaches the server with the page and no query", async ({ page, backend }) => {
  await backend.authenticate(page);
  await page.goto("/bowls?from=somewhere");

  await page.getByRole("button", { name: "Navigation menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Send feedback" }).click();
  const sheet = page.getByRole("dialog", { name: "Feedback" });
  await sheet.getByRole("textbox").fill("The draw button needed two taps");
  await sheet.getByRole("button", { name: "Send", exact: true }).click();

  await expect(sheet.getByText("Thanks")).toBeVisible();
  expect(backend.state.feedbackReports).toEqual([
    expect.objectContaining({ message: "The draw button needed two taps", page: "/bowls", errorText: "" }),
  ]);
});

test("the TV's code opens the sheet about the TV", async ({ page, backend }) => {
  await backend.authenticate(page);
  await page.goto("/bowls?feedback=tv");

  const sheet = page.getByRole("dialog", { name: "Feedback" });
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\/bowls$/);
  await sheet.getByRole("textbox").fill("The remote skipped a row");
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await expect(sheet.getByText("Thanks")).toBeVisible();
  expect(backend.state.feedbackReports[0]).toMatchObject({ page: "/tv" });
});
