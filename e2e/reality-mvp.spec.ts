import { expect, test } from "@playwright/test";

test("creates the default prototype and opens the AR route", async ({ page }) => {
  await page.route("**/api/refine-concept", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        refinement: {
          source: "fallback",
          visualDirection: "Use a strong product color palette.",
          generationBrief: "Founder wants a smart bottle.",
          promptAdditions: ["Add logo placement.", "Use material contrast.", "Make the LED visible."],
          questions: [
            { id: "brand", label: "Brand", placeholder: "OpenAI logo" },
            { id: "colors", label: "Colors", placeholder: "black and green" },
            { id: "materials", label: "Materials", placeholder: "metal and silicone" },
            { id: "detail", label: "Detail", placeholder: "LED ring" },
          ],
        },
      }),
    });
  });
  await page.route("**/api/generate-model/start", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        generation: {
          status: "failed",
          mode: "text-to-3d",
          refinedMeshyPrompt: "fallback",
          fallbackModelPath: "/models/bottle.glb",
        },
      }),
    });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Answer product questions" }).click();
  await expect(page.getByText("Brand")).toBeVisible();
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
