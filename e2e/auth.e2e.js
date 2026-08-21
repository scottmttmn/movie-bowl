import { expect, test } from "./support/fakeBackend";

test("a signed-out protected route redirects to login and can request a magic link", async ({
  page,
  backend,
}) => {
  await page.goto("/watch-list");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();

  await page.getByPlaceholder("Email").fill("smoke@example.com");
  await page.getByRole("button", { name: "Send Magic Link" }).click();

  await expect(page.getByText("Check your email for a magic link.")).toBeVisible();
  await expect
    .poll(() =>
      backend.requests.some(
        (request) =>
          request.method === "POST" &&
          request.pathname === "/auth/v1/otp" &&
          request.body?.email === "smoke@example.com"
      )
    )
    .toBe(true);
});
