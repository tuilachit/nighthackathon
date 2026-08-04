import { expect, test } from "@playwright/test";

test("landing explains Fitment and routes both entry choices honestly", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("FITMENT", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "only shows you furniture that actually fits, your space and your front door",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Measure your space" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try a demo space" })).toBeVisible();

  await page.getByRole("link", { name: "Try a demo space" }).click();
  await expect(page).toHaveURL(/\/fit\?demo=1$/);
  await expect(
    page.getByRole("heading", { name: "Verified fits", exact: true }),
  ).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Measure your space" }).click();
  await expect(page).toHaveURL(/\/fit\?new=1$/);
  await expect(
    page.getByRole("heading", {
      name: "Measure the space furniture has to fit.",
    }),
  ).toBeVisible();
});

test("first visit guides a real manual measurement before showing results", async ({ page }) => {
  await page.goto("/fit");

  await expect(
    page.getByRole("heading", {
      name: "Measure the space furniture has to fit.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Verified fits", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try a demo space" })).toBeVisible();

  await page.getByRole("spinbutton").fill("99");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText("Width must be at least 100 mm (10 cm).", { exact: true }),
  ).toBeVisible();
  await page.getByRole("spinbutton").fill("900");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/Step 2 of 4 · Height/)).toBeVisible();
  await page.getByRole("spinbutton").fill("1800");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("spinbutton").fill("350");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("spinbutton").fill("820");
  await page.getByRole("button", { name: "Find furniture that fits" }).click();

  const measurement = page.getByRole("region", {
    name: "Your space is the search filter.",
  });
  await expect(measurement).toContainText("manual tape measurement");
  await expect(measurement).toContainText("820 mm");
  await expect(measurement).toContainText("±25 mm");
  await expect(page.getByLabel("Saved space")).toContainText("My space");
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Space name").fill("Bedroom alcove");
  await page.getByRole("button", { name: "Save" }).click();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Verified fits", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Saved space")).toContainText("Bedroom alcove");
  await expect(
    page.getByRole("heading", {
      name: "Measure the space furniture has to fit.",
    }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Measure new" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Measure the space furniture has to fit.",
    }),
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

  await page.getByRole("button", { name: "Try a demo space" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Measured space in. Only verified fits out.",
    }),
  ).toBeVisible();
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

  await expect(catalogStatus).toContainText("offline ready");
  await expect(
    page.getByRole("heading", { name: "Verified fits", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fits the space, access issue" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Near misses" })).toBeVisible();
  await expect(page.getByText("Dimensions verified").first()).toBeVisible();

  const fits = page.getByRole("region", { name: "Verified fits" });
  await expect(fits.locator("article")).toHaveCount(6);
  await expect(
    fits.getByRole("button", { name: "Show all 25 fits" }),
  ).toBeVisible();
  const collapsedTierDistance = await page.evaluate(() => {
    const fitCards = document.querySelectorAll(
      'section[aria-label="Verified fits"] article',
    );
    const accessHeading = Array.from(document.querySelectorAll("h2")).find(
      (heading) => heading.textContent === "Fits the space, access issue",
    );
    const finalFitCard = fitCards.item(fitCards.length - 1);
    if (!(finalFitCard instanceof HTMLElement) || !(accessHeading instanceof HTMLElement)) {
      return Number.POSITIVE_INFINITY;
    }
    return accessHeading.getBoundingClientRect().top - finalFitCard.getBoundingClientRect().bottom;
  });
  expect(collapsedTierDistance).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerHeight),
  );

  await context.setOffline(true);
  await page.getByRole("button", { name: "white metal shelving unit under $30" }).click();
  await expect(page.getByLabel("Describe the furniture you want")).toHaveValue(
    "white metal shelving unit under $30",
  );
  await expect(page.getByText("Under $30", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: /Top IKEA \+ Target/ })
    .click();
  const comparison = page.getByRole("region", {
    name: "Clearance comparison",
  });
  await expect(comparison).toBeVisible();
  await expect(comparison.getByText("IKEA")).toBeVisible();
  await expect(comparison.getByText("Target")).toBeVisible();
  await expect(comparison.getByText(/Δ \d+ mm/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Comparing" })).toHaveCount(2);

  await page.getByRole("button", { name: "View in room" }).first().click();
  await expect(page.getByRole("button", { name: "View in AR" })).toBeVisible();
  await expect(page.getByRole("button", { name: "‹ Back to results" })).toBeVisible();
});

test("a shared comparison reproduces the exact products and clearances in a fresh context", async ({
  browser,
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/fit");
  await page.getByRole("button", { name: "Try a demo space" }).click();
  await page.getByRole("button", { name: /Top IKEA \+ Target/ }).click();

  const comparison = page.getByRole("region", { name: "Clearance comparison" });
  const expectedProducts = await comparison.locator("article h3").allTextContents();
  const expectedClearances = await comparison
    .locator(".fit-dimension-annotation__value")
    .allTextContents();
  await comparison.getByRole("button", { name: "Share" }).click();
  await expect(
    comparison.getByRole("button", { name: "Link copied" }),
  ).toBeVisible();
  const shareUrl = await page.evaluate(() => navigator.clipboard.readText());

  const freshContext = await browser.newContext({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
  });
  const freshPage = await freshContext.newPage();
  await freshPage.goto(shareUrl);
  const sharedComparison = freshPage.getByRole("region", {
    name: "Clearance comparison",
  });
  await expect(sharedComparison).toBeVisible();
  expect(await sharedComparison.locator("article h3").allTextContents()).toEqual(
    expectedProducts,
  );
  expect(
    await sharedComparison
      .locator(".fit-dimension-annotation__value")
      .allTextContents(),
  ).toEqual(expectedClearances);
  await expect(freshPage.getByLabel("Saved space")).toContainText(
    "Current space",
  );
  await freshContext.close();
});
