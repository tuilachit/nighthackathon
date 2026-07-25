import { expect, test } from "@playwright/test";

test("creates the default prototype and opens the AR route", async ({ page }) => {
  await page.route("**/api/refine-concept", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        refinement: {
          source: "fallback",
          visualDirection: "Use clear object details.",
          generationBrief: "Founder wants a smart bottle.",
          promptAdditions: ["Define the silhouette.", "Use material contrast.", "Make the LED visible."],
          questions: [
            { id: "shape", label: "Shape", placeholder: "tall cylinder" },
            { id: "parts", label: "Visible parts", placeholder: "cap and grip" },
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

  await page.getByLabel("Product prompt").fill("A smart water bottle for gym users");
  await page.getByRole("button", { name: "Answer product questions" }).click();
  await expect(page.getByText("Shape", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Generate Reality MVP" }).click();
  await expect(page).toHaveURL(/\/result\/smart-hydration-bottle$/);
  await expect(page.getByRole("heading", { name: "Smart Hydration Bottle" })).toBeVisible();
  await expect(page.getByText("Demo preflight")).toBeVisible();
  await expect(page.getByText("Phone handoff")).toBeVisible();

  await page.getByRole("link", { name: "Open Launch Page" }).click();
  await expect(page).toHaveURL(/\/launch\/smart-hydration-bottle$/);
  await expect(page.getByRole("heading", { name: "Smart Hydration Bottle" })).toBeVisible();
  await page.getByLabel("Email").fill("founder@example.com");
  await page.getByRole("button", { name: "Generate launch code" }).click();
  await expect(page.getByText("Code package ready. Use the frontend and backend snippets below when you are ready to connect Notion.")).toBeVisible();
  await expect(page.getByText("Frontend waitlist form")).toBeVisible();
  await expect(page.getByText("Backend Notion route")).toBeVisible();

  await page.getByRole("link", { name: "View in AR" }).click();
  await expect(page).toHaveURL(/\/ar\/smart-hydration-bottle$/);
  await expect(page.getByTestId("view-in-ar-button")).toBeVisible();
});

test("shows the Codex Build Pack generated files", async ({ page }) => {
  await page.goto("/build-pack/smart-hydration-bottle");

  await expect(page.getByRole("heading", { name: "Smart Hydration Bottle" })).toBeVisible();
  await expect(page.getByText("Codex to generate the runnable spatial prototype and launch app layer")).toBeVisible();
  await expect(page.getByText("app/launch/[id]/page.tsx")).toBeVisible();
  await expect(page.getByText("app/api/waitlist/route.ts")).toBeVisible();
  await expect(page.getByText("Codex generation trace")).toBeVisible();
  await expect(page.getByRole("button", { name: "product.config.json" })).toBeVisible();
});
