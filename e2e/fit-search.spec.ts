import { expect, test } from "@playwright/test";

test("manual measurement is an honest first-class entry", async ({ page }) => {
  await page.goto("/fit");

  await expect(
    page.getByRole("heading", { name: "Measure the space first." }),
  ).toBeVisible();
  await expect(
    page.getByText("Live WebXR capture is not enabled"),
  ).toBeVisible();

  await page.getByRole("spinbutton", { name: /^Width/ }).fill("900");
  await page.getByRole("spinbutton", { name: /^Height/ }).fill("1800");
  await page.getByRole("spinbutton", { name: /^Depth/ }).fill("350");
  await page
    .getByRole("spinbutton", { name: /^Narrowest access opening/ })
    .fill("820");
  await page.getByRole("button", { name: "Use these measurements" }).click();

  const measurement = page.getByRole("region", {
    name: "Your space is the search filter.",
  });
  await expect(measurement).toContainText("manual tape measurement");
  await expect(measurement).toContainText("820 mm");
  await page.getByRole("button", { name: "Edit measurements" }).click();
  await expect(
    page.getByRole("heading", { name: "Measure the space first." }),
  ).toBeVisible();
});

test("fit-first mobile route is honest with AI disabled and remains usable offline", async ({
  context,
  page,
}) => {
  await page.route("**/api/parse-query", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ available: false }),
    });
  });

  await page.goto("/fit");
  await page
    .getByRole("button", { name: "Use labeled demo measurement" })
    .click();

  await expect(page.getByRole("heading", { name: "Stop guessing. Shop what fits." })).toBeVisible();
  const measurement = page.getByRole("region", { name: "Your space is the search filter." });
  await expect(measurement).toContainText("900");
  await expect(measurement).toContainText("820 mm");
  const catalogStatus = page.getByTestId("catalog-status");
  if ((await catalogStatus.textContent())?.includes("unavailable")) {
    await expect(page.getByTestId("catalog-unavailable")).toContainText(
      "No placeholder products are being shown",
    );
    await expect(page.getByText("Dimensions verified")).toHaveCount(0);
    return;
  }

  await expect(catalogStatus).toContainText("Verified catalog cached for offline use");
  await expect(page.getByRole("heading", { name: /verified fits/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fits the space, access issue" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Near misses" })).toBeVisible();
  await expect(page.getByText("Dimensions verified").first()).toBeVisible();

  await context.setOffline(true);
  await page.getByRole("button", { name: "white metal shelving unit under $30" }).click();
  await expect(page.getByLabel("Describe the furniture you want")).toHaveValue(
    "white metal shelving unit under $30",
  );
  await expect(page.getByText("Under $30", { exact: true })).toBeVisible();

  const compareButtons = page.getByRole("button", { name: "Compare" });
  await compareButtons.nth(0).click();
  await compareButtons.nth(1).click();
  await compareButtons.nth(2).click();
  await expect(page.getByText("3/3")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Compare clearance" })).toBeVisible();

  await page.getByRole("button", { name: "View in room" }).first().click();
  await expect(page.getByRole("button", { name: "View in AR" })).toBeVisible();
  await expect(page.getByRole("button", { name: "‹ Back to results" })).toBeVisible();
});
