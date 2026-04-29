import { expect, test } from "@playwright/test";

test("creates the default prototype and opens the AR route", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Generate Reality MVP" }).click();
  await expect(page).toHaveURL(/\/result\/smart-hydration-bottle$/);
  await expect(page.getByRole("heading", { name: "Smart Hydration Bottle" })).toBeVisible();
  await expect(page.getByText("Demo preflight")).toBeVisible();
  await expect(page.getByText("Phone handoff")).toBeVisible();

  await page.getByRole("link", { name: "View in AR" }).click();
  await expect(page).toHaveURL(/\/ar\/smart-hydration-bottle$/);
  await expect(page.getByTestId("view-in-ar-button")).toBeVisible();
});

test("shows the Codex Build Pack generated files", async ({ page }) => {
  await page.goto("/build-pack/smart-hydration-bottle");

  await expect(page.getByRole("heading", { name: "Smart Hydration Bottle" })).toBeVisible();
  await expect(page.getByText("Codex to generate the runnable spatial prototype app layer")).toBeVisible();
  await expect(page.getByText("Codex generation trace")).toBeVisible();
  await expect(page.getByRole("button", { name: "product.config.json" })).toBeVisible();
});
