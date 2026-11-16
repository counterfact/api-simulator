import { expect, test } from "@playwright/test";

test("renders the successful profile", async ({ page }) => {
  await page.goto("/?profile=1");
  await expect(
    page.getByRole("heading", { name: "Ada Lovelace" }),
  ).toBeVisible();
  await expect(page.getByText("Profile 1", { exact: true })).toBeVisible();
});

test("renders the not-found state", async ({ page }) => {
  await page.goto("/?profile=404");
  await expect(
    page.getByRole("heading", { name: "Profile not found" }),
  ).toBeVisible();
  await expect(page.getByText("Choose another profile.")).toBeVisible();
});

test("renders the temporary-failure state", async ({ page }) => {
  await page.goto("/?profile=503");
  await expect(page.getByRole("alert")).toContainText(
    "Profile temporarily unavailable",
  );
  await expect(page.getByText("Please try again.")).toBeVisible();
});
