import { expect, test } from "@playwright/test";

test("fit-first mobile flow works with AI disabled", async ({ page }) => {
  await page.route("**/api/parse-query", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ available: false }),
    });
  });

  await page.goto("/fit");

  await expect(page.getByRole("heading", { name: "Stop guessing. Shop what fits." })).toBeVisible();
  const measurement = page.getByRole("region", { name: "Your space is the search filter." });
  await expect(measurement).toContainText("900");
  await expect(measurement).toContainText("820 mm");
  await expect(page.getByRole("heading", { name: /verified fits/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fits the space, access issue" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Near misses" })).toBeVisible();
  await expect(page.getByText("Dimensions verified").first()).toBeVisible();

  await page.getByRole("button", { name: "white shelving unit under $200" }).click();
  await expect(page.getByLabel("Describe the furniture you want")).toHaveValue(
    "white shelving unit under $200",
  );
  await expect(page.getByText("Under $200", { exact: true })).toBeVisible();

  const compareButtons = page.getByRole("button", { name: "Compare" });
  await compareButtons.nth(0).click();
  await compareButtons.nth(1).click();
  await compareButtons.nth(2).click();
  await expect(page.getByText("3/3")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Compare clearance" })).toBeVisible();

  await page.getByRole("button", { name: "View in room" }).first().click();
  await expect(page.getByTestId("selection-handoff")).toContainText("Ready for placement");
});
