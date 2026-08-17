import { expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";

const WORKFLOW_PROMPT = "00000000-0000-4000-8000-000000000101";
const WORKFLOW_LINK = "00000000-0000-4000-8000-000000000102";
const WORKFLOW_ALTERNATIVES = "00000000-0000-4000-8000-000000000103";
const WORKFLOW_CACHE = "00000000-0000-4000-8000-000000000104";
const WORKFLOW_REFRESH = "00000000-0000-4000-8000-000000000105";
const WORKFLOW_RESTORE = "00000000-0000-4000-8000-000000000106";
const WORKFLOW_CANCEL = "00000000-0000-4000-8000-000000000107";

const IKEA_FIT_ID = "00000000-0000-4000-8000-000000000201";
const KMART_FIT_ID = "00000000-0000-4000-8000-000000000202";
const ACCESS_ID = "00000000-0000-4000-8000-000000000203";
const NEAR_ID = "00000000-0000-4000-8000-000000000204";
const LINKED_ID = "00000000-0000-4000-8000-000000000205";

const PUBLIC_SHARE_TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGH123456789";
const CHECKED_AT = "2026-08-17T00:15:00.000Z";
const EXPIRES_AT = "2026-09-16T00:15:00.000Z";
const PROMPT = "narrow oak bookcase under $300";
const LINKED_PRODUCT_URL =
  "https://www.templeandwebster.com.au/Carter-Narrow-Bookcase-CNB100.html?colour=oak";

const MEASUREMENT = {
  widthMm: 900,
  heightMm: 1_800,
  depthMm: 350,
  accessWidthMm: 820,
  uncertaintyMm: 25,
  source: "manual",
} as const;

type MockIntent =
  | { readonly kind: "prompt"; readonly text: string; readonly retailers: readonly string[] }
  | { readonly kind: "product-link"; readonly url: string };

interface MockSearchRequest {
  readonly intent: MockIntent;
  readonly measurement: typeof MEASUREMENT;
  readonly cachePolicy: "prefer-recent" | "force-refresh";
}

interface MockWorkflow {
  readonly id: string;
  readonly state: string;
  readonly queryText: string;
  readonly intent: MockIntent;
  readonly measurement: typeof MEASUREMENT;
  readonly retailers: readonly string[];
  readonly cachePolicy: "prefer-recent" | "force-refresh";
  readonly cacheHit: boolean;
  readonly freshness: "cached" | "live";
  readonly checkedAt: string;
  readonly candidates: readonly Record<string, unknown>[];
  readonly isPartial: boolean;
  readonly coverageNotes: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface SearchPlan {
  readonly workflow: MockWorkflow;
  readonly createState?: string;
  readonly cacheHit?: boolean;
  readonly freshness?: "cached" | "live";
  readonly checkedAt?: string;
}

interface MockApiOptions {
  readonly planSearch?: (
    request: MockSearchRequest,
    index: number,
  ) => SearchPlan;
  readonly loseFirstSearchAcknowledgement?: boolean;
}

interface MockApiState {
  readonly searchRequests: MockSearchRequest[];
  readonly searchIdempotencyKeys: string[];
  readonly shareRequests: Array<{
    readonly selections: readonly {
      readonly workflowId: string;
      readonly candidateId: string;
    }[];
  }>;
  readonly workflows: Map<string, MockWorkflow>;
  cancelledWorkflowId?: string;
}

test.beforeEach(async ({ page }, testInfo) => {
  page.on("pageerror", (error) => {
    console.error(`[${testInfo.project.name}] client exception: ${error.stack ?? error.message}`);
  });
});

test("first-time prompt journey measures a space and returns all decision tiers", async ({ page }) => {
  const api = await installMockApi(page);

  await page.goto("/");
  await expect(page.getByText("FITMENT", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Compare furniture that fits your measured space—with delivery risks flagged before you buy.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Measure your space" }).click();

  await completeManualMeasurement(page);
  await expect(page.getByRole("button", { name: "Describe what I need" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Check a product link" })).toBeVisible();

  await submitPrompt(page, PROMPT);

  await expect(page.getByRole("heading", { name: "Fits", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fits the space, access issue" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Near misses" })).toBeVisible();
  await expect(page.getByText("Fits the space, but 35 mm too wide for the 820 mm access opening.")).toBeVisible();
  await expect(page.getByText("35 mm too tall.")).toBeVisible();

  expect(api.searchRequests).toHaveLength(1);
  expect(api.searchRequests[0]).toEqual({
    intent: {
      kind: "prompt",
      text: PROMPT,
      retailers: ["ikea-au", "kmart-au"],
    },
    measurement: MEASUREMENT,
    cachePolicy: "prefer-recent",
  });
});

test("exact product link stays exact and alternatives require a second explicit submit", async ({ page }) => {
  await seedMeasuredSpace(page);
  const api = await installMockApi(page, {
    planSearch: (request, index) => {
      if (index === 0) {
        return {
          workflow: makeWorkflow({
            id: WORKFLOW_LINK,
            intent: request.intent,
            candidates: [linkedCandidate],
          }),
        };
      }
      return {
        workflow: makeWorkflow({
          id: WORKFLOW_ALTERNATIVES,
          intent: request.intent,
          candidates: LIVE_CANDIDATES,
        }),
      };
    },
  });

  await page.goto("/");
  await page.getByRole("link", { name: "Check a product" }).click();
  await expect(page).toHaveURL(/\/fit\?mode=link$/);
  await expect(page.getByRole("button", { name: "Check a product link" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByLabel(/^Retailer product link/).fill(LINKED_PRODUCT_URL);
  await page.getByRole("button", { name: "Search current retailer products" }).click();
  const linkedCard = page.getByTestId(`live-candidate-${LINKED_ID}`);
  await expect(linkedCard.getByText("Linked product", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Find comparable alternatives" })).toBeVisible();
  expect(api.searchRequests).toHaveLength(1);
  expect(api.searchRequests[0]?.intent).toEqual({
    kind: "product-link",
    url: LINKED_PRODUCT_URL,
  });

  await page.getByRole("button", { name: "Find comparable alternatives" }).click();
  await expect(page.getByRole("button", { name: "Describe what I need" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByLabel(/^What should fit here\?/)).toHaveValue(
    /Comparable bookcase to Carter narrow bookcase, listed at/,
  );
  expect(api.searchRequests).toHaveLength(1);

  await page.getByRole("button", { name: "Search current retailer products" }).click();
  await expect(page.getByTestId(`live-candidate-${IKEA_FIT_ID}`)).toBeVisible();
  await expect(page.getByTestId(`live-candidate-${KMART_FIT_ID}`)).toBeVisible();
  expect(api.searchRequests).toHaveLength(2);
  expect(api.searchRequests[1]?.intent).toMatchObject({
    kind: "prompt",
    retailers: ["ikea-au", "kmart-au"],
  });
});

test("a recent exact cache hit renders immediately and force refresh sends a new command", async ({ page }) => {
  await seedMeasuredSpace(page);
  const api = await installMockApi(page, {
    planSearch: (request, index) => {
      if (index === 0) {
        return {
          workflow: makeWorkflow({
            id: WORKFLOW_CACHE,
            intent: request.intent,
            candidates: LIVE_CANDIDATES,
            cacheHit: true,
            freshness: "cached",
          }),
          cacheHit: true,
          freshness: "cached",
          checkedAt: CHECKED_AT,
        };
      }
      return {
        workflow: makeWorkflow({
          id: WORKFLOW_REFRESH,
          intent: request.intent,
          candidates: LIVE_CANDIDATES,
          cacheHit: false,
          freshness: "live",
        }),
      };
    },
  });

  await page.goto("/fit");
  await submitPrompt(page, PROMPT);
  await expect(page.getByRole("heading", { name: "Fits", exact: true })).toBeVisible();
  await expect(page.getByText(/recent indexed observation/i)).toBeVisible();
  expect(api.searchRequests[0]?.cachePolicy).toBe("prefer-recent");

  await page.getByRole("radio", { name: /Check live/ }).check();
  await page.getByRole("button", { name: "Search current retailer products" }).click();
  await expect(page).toHaveURL(new RegExp(`job=${WORKFLOW_REFRESH}`));
  await expect(page.getByText(/live retailer fetch/i)).toBeVisible();
  expect(api.searchRequests).toHaveLength(2);
  expect(api.searchRequests[1]?.cachePolicy).toBe("force-refresh");
});

test("reload restores an owner job from its URL without resubmitting", async ({ page }) => {
  await seedMeasuredSpace(page);
  const api = await installMockApi(page, {
    planSearch: (request) => ({
      workflow: makeWorkflow({
        id: WORKFLOW_RESTORE,
        state: "searching",
        intent: request.intent,
        candidates: [],
      }),
      createState: "searching",
    }),
  });

  await page.goto("/fit");
  await submitPrompt(page, PROMPT);
  await expect(page).toHaveURL(new RegExp(`job=${WORKFLOW_RESTORE}`));
  await expect(page.getByRole("button", { name: "Cancel this job" })).toBeVisible();

  api.workflows.set(
    WORKFLOW_RESTORE,
    makeWorkflow({
      id: WORKFLOW_RESTORE,
      intent: { kind: "prompt", text: PROMPT, retailers: ["ikea-au", "kmart-au"] },
      candidates: LIVE_CANDIDATES,
    }),
  );
  await page.reload();

  await expect(page.getByRole("heading", { name: "Fits", exact: true })).toBeVisible();
  await expect(page.getByText(`Request: “${PROMPT}”`, { exact: false })).toBeVisible();
  expect(api.searchRequests).toHaveLength(1);
});

test("an active workflow can be durably cancelled once", async ({ page }) => {
  await seedMeasuredSpace(page);
  const api = await installMockApi(page, {
    planSearch: (request) => ({
      workflow: makeWorkflow({
        id: WORKFLOW_CANCEL,
        state: "searching",
        intent: request.intent,
        candidates: [],
      }),
      createState: "searching",
    }),
  });

  await page.goto("/fit");
  await submitPrompt(page, PROMPT);
  await expect(page.getByRole("button", { name: "Search in progress…" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel this job" }).click();

  await expect(page.getByText(/job is durably cancelled/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel this job" })).toHaveCount(0);
  expect(api.cancelledWorkflowId).toBe(WORKFLOW_CANCEL);
});

test("comparison defaults cross-retailer and also accepts access issues and near misses", async ({ context, page }) => {
  await seedMeasuredSpace(page);
  await installMockApi(page);
  await interceptRetailerPages(context);

  await page.goto("/fit");
  await submitPrompt(page, PROMPT);

  await page.getByLabel("Live comparison tray").getByRole("button").click();
  const comparison = page.getByRole("region", { name: "Live product comparison" });
  await expect(comparison.getByText("BILLY narrow bookcase", { exact: true })).toBeVisible();
  await expect(comparison.getByText("Kmart slim cube shelf", { exact: true })).toBeVisible();
  await expect(comparison.getByText(/Δ \d+ mm/)).toBeVisible();

  await comparison.getByRole("button", { name: "Close" }).click();
  await page.getByTestId(`live-candidate-${IKEA_FIT_ID}`).getByRole("button", { name: "Comparing" }).click();
  await page.getByTestId(`live-candidate-${KMART_FIT_ID}`).getByRole("button", { name: "Comparing" }).click();
  await page.getByTestId(`live-candidate-${ACCESS_ID}`).getByRole("button", { name: "Compare" }).click();
  await page.getByTestId(`live-candidate-${NEAR_ID}`).getByRole("button", { name: "Compare" }).click();
  await page.getByLabel("Live comparison tray").getByRole("button").click();

  await expect(comparison.getByText("Wide modular shelf", { exact: true })).toBeVisible();
  await expect(comparison.getByText("Tall display shelf", { exact: true })).toBeVisible();
  await expect(comparison.getByRole("button", { name: "Review for 3D" })).toHaveCount(0);

  await comparison.getByRole("button", { name: "Close" }).click();
  const retailerLink = page
    .getByTestId(`live-candidate-${IKEA_FIT_ID}`)
    .getByRole("link", { name: "View at retailer ↗" });
  const [retailerPage] = await Promise.all([
    page.waitForEvent("popup"),
    retailerLink.click(),
  ]);
  await retailerPage.waitForLoadState("domcontentloaded");
  expect(retailerPage.url()).toBe(IKEA_PRODUCT_URL);
  await retailerPage.close();
});

test("a shared comparison opens directly in a fresh context with no owner authority", async ({ browser, page }) => {
  await seedMeasuredSpace(page);
  const api = await installMockApi(page);

  await page.goto("/fit");
  await submitPrompt(page, PROMPT);
  await page.getByLabel("Live comparison tray").getByRole("button").click();
  await page.getByRole("button", { name: "Share comparison" }).click();

  const shareInput = page.getByLabel(/Share link/);
  await expect(shareInput).toHaveValue(new RegExp(`/fit/share/${PUBLIC_SHARE_TOKEN}$`));
  expect(api.shareRequests).toEqual([
    {
      selections: [
        { workflowId: WORKFLOW_PROMPT, candidateId: IKEA_FIT_ID },
        { workflowId: WORKFLOW_PROMPT, candidateId: KMART_FIT_ID },
      ],
    },
  ]);

  const shareUrl = await shareInput.inputValue();
  const freshContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await freshContext.route(`**/fit/share/${PUBLIC_SHARE_TOKEN}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: sharedComparisonDocument(),
    });
  });
  const freshPage = await freshContext.newPage();
  await freshPage.goto(shareUrl);

  await expect(freshPage.getByRole("heading", { name: "Clearance comparison" })).toBeVisible();
  await expect(freshPage.getByText("BILLY narrow bookcase", { exact: true })).toBeVisible();
  await expect(freshPage.getByText("Kmart slim cube shelf", { exact: true })).toBeVisible();
  await expect(freshPage.getByText("900 W × 1800 H × 350 D mm", { exact: true })).toBeVisible();
  await expect(freshPage.getByRole("button", { name: /search|generate/i })).toHaveCount(0);
  await freshContext.close();
});

test("loaded results remain readable offline and live actions explain the connection requirement", async ({ context, page }) => {
  await seedMeasuredSpace(page);
  await installMockApi(page);

  await page.goto("/fit");
  await submitPrompt(page, PROMPT);
  await expect(page.getByTestId(`live-candidate-${IKEA_FIT_ID}`)).toBeVisible();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));

  await expect(page.getByText(/offline/i)).toBeVisible();
  await expect(page.getByTestId(`live-candidate-${IKEA_FIT_ID}`)).toBeVisible();
  await expect(page.getByRole("button", { name: /Search current retailer products|Refresh retailer data/ })).toBeDisabled();
});

test("explicit new and demo actions override a session-stored job", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      "fitment.live-workflow-id",
      "00000000-0000-4000-8000-000000000199",
    );
  });

  await page.goto("/fit?new=1");
  await expect(page.getByRole("heading", { name: "Measure the space furniture has to fit." })).toBeVisible();

  await page.goto("/fit?demo=1");
  await expect(page.getByRole("heading", { name: "Verified fits", exact: true })).toBeVisible();
});

test("a lost create acknowledgement retries after reload with one stable idempotency key", async ({ page }) => {
  test.setTimeout(60_000);
  await seedMeasuredSpace(page);
  const api = await installMockApi(page, { loseFirstSearchAcknowledgement: true });

  await page.goto("/fit");
  await submitPrompt(page, PROMPT);
  await expect(page.getByRole("button", { name: "Search acknowledgement pending" })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => {
    const raw = window.sessionStorage.getItem("fitment.pending-search-v1");
    return raw === null ? null : (JSON.parse(raw) as { state?: string }).state;
  })).toBe("posting");

  await page.reload();

  await expect(page.getByRole("heading", { name: "Fits", exact: true })).toBeVisible();
  expect(api.searchRequests).toHaveLength(2);
  expect(api.searchIdempotencyKeys).toHaveLength(2);
  expect(api.searchIdempotencyKeys[1]).toBe(api.searchIdempotencyKeys[0]);
  await expect.poll(() => page.evaluate(
    () => window.sessionStorage.getItem("fitment.pending-search-v1"),
  )).toBeNull();
});

async function installMockApi(
  page: Page,
  options: MockApiOptions = {},
): Promise<MockApiState> {
  const state: MockApiState = {
    searchRequests: [],
    searchIdempotencyKeys: [],
    shareRequests: [],
    workflows: new Map(),
  };

  await page.route("https://images.example.test/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4WQAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  });
  await page.route("**/_vercel/insights/**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (request.method() === "POST" && path === "/api/v1/session") {
      await fulfillJson(route, { authenticated: true });
      return;
    }
    if (request.method() === "POST" && path === "/api/v1/product-events") {
      await fulfillJson(route, { recorded: true }, 202);
      return;
    }
    if (request.method() === "POST" && path === "/api/v1/search-jobs") {
      const command = request.postDataJSON() as MockSearchRequest;
      const index = state.searchRequests.length;
      state.searchRequests.push(command);
      state.searchIdempotencyKeys.push(request.headers()["idempotency-key"] ?? "");
      const plan = options.planSearch?.(command, index) ?? {
        workflow: makeWorkflow({
          id: WORKFLOW_PROMPT,
          intent: command.intent,
          candidates: LIVE_CANDIDATES,
        }),
      };
      state.workflows.set(plan.workflow.id, plan.workflow);
      if (options.loseFirstSearchAcknowledgement === true && index === 0) {
        await route.abort("connectionfailed");
        return;
      }
      await fulfillJson(
        route,
        {
          workflowId: plan.workflow.id,
          state: plan.createState ?? plan.workflow.state,
          reused: false,
          cacheHit: plan.cacheHit ?? plan.workflow.cacheHit,
          freshness: plan.freshness ?? plan.workflow.freshness,
          ...(plan.checkedAt === undefined ? {} : { checkedAt: plan.checkedAt }),
        },
        plan.createState === "searching" || plan.createState === "queued" ? 202 : 200,
      );
      return;
    }

    const cancelMatch = path.match(/^\/api\/v1\/search-jobs\/([^/]+)\/cancel$/);
    if (request.method() === "POST" && cancelMatch !== null) {
      state.cancelledWorkflowId = decodeURIComponent(cancelMatch[1]);
      await fulfillJson(route, {
        workflowId: state.cancelledWorkflowId,
        state: "cancelled",
        alreadyTerminal: false,
        providerStop: "requested",
      });
      return;
    }

    const workflowMatch = path.match(/^\/api\/v1\/search-jobs\/([^/]+)$/);
    if (request.method() === "GET" && workflowMatch !== null) {
      const workflowId = decodeURIComponent(workflowMatch[1]);
      const workflow = state.workflows.get(workflowId);
      if (workflow === undefined) {
        await fulfillJson(route, { error: { code: "not_found", message: "Workflow not found." } }, 404);
      } else {
        await fulfillJson(route, workflow);
      }
      return;
    }

    if (request.method() === "POST" && path === "/api/v1/comparison-shares") {
      const command = request.postDataJSON() as {
        readonly selections: readonly {
          readonly workflowId: string;
          readonly candidateId: string;
        }[];
      };
      state.shareRequests.push(command);
      await fulfillJson(route, {
        path: `/fit/share/${PUBLIC_SHARE_TOKEN}`,
        expiresAt: EXPIRES_AT,
      }, 201);
      return;
    }

    await fulfillJson(
      route,
      {
        error: {
          code: "unhandled_test_request",
          message: `The E2E mock rejected ${request.method()} ${path}.`,
        },
      },
      599,
    );
  });

  return state;
}

async function completeManualMeasurement(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Measure the space furniture has to fit." }),
  ).toBeVisible();
  for (const [value, action] of [
    ["900", "Continue"],
    ["1800", "Continue"],
    ["350", "Continue"],
    ["820", "Find furniture that fits"],
  ] as const) {
    await page.getByRole("spinbutton").fill(value);
    await page.getByRole("button", { name: action }).click();
  }
  await expect(page.getByRole("heading", { name: "Search the live market" })).toBeVisible();
}

async function submitPrompt(page: Page, prompt: string): Promise<void> {
  await page.getByRole("button", { name: "Describe what I need" }).click();
  await page.getByLabel(/^What should fit here\?/).fill(prompt);
  await page.getByRole("button", { name: "Search current retailer products" }).click();
}

async function seedMeasuredSpace(page: Page): Promise<void> {
  await page.addInitScript(({ key, value }) => {
    if (window.localStorage.getItem(key) === null) {
      window.localStorage.setItem(key, value);
    }
  }, {
    key: "fitment.saved-spaces.v1",
    value: JSON.stringify([
      {
        id: "space-e2e",
        name: "Bedroom alcove",
        measurement: MEASUREMENT,
        createdAt: "2026-08-17T00:00:00.000Z",
      },
    ]),
  });
}

async function interceptRetailerPages(context: BrowserContext): Promise<void> {
  await context.route("https://www.ikea.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><title>IKEA retailer product</title><h1>BILLY narrow bookcase</h1>",
    });
  });
  await context.route("https://www.kmart.com.au/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><title>Kmart retailer product</title><h1>Kmart slim cube shelf</h1>",
    });
  });
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body),
  });
}

function makeWorkflow({
  id,
  intent,
  candidates,
  state = "ready_for_approval",
  cacheHit = false,
  freshness = "live",
}: {
  readonly id: string;
  readonly intent: MockIntent;
  readonly candidates: readonly Record<string, unknown>[];
  readonly state?: string;
  readonly cacheHit?: boolean;
  readonly freshness?: "cached" | "live";
}): MockWorkflow {
  return {
    id,
    state,
    queryText: intent.kind === "prompt" ? intent.text : intent.url,
    intent,
    measurement: MEASUREMENT,
    retailers: intent.kind === "prompt" ? intent.retailers : [],
    cachePolicy: cacheHit ? "prefer-recent" : "force-refresh",
    cacheHit,
    freshness,
    checkedAt: CHECKED_AT,
    candidates,
    isPartial: false,
    coverageNotes: [],
    createdAt: "2026-08-17T00:14:00.000Z",
    updatedAt: CHECKED_AT,
  };
}

const IKEA_PRODUCT_URL = "https://www.ikea.com/au/en/p/billy-bookcase-e2e/";

const ikeaFitCandidate = candidate({
  id: IKEA_FIT_ID,
  rank: 0,
  retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
  retailerProductId: "IKEA-E2E-1",
  name: "BILLY narrow bookcase",
  productUrl: IKEA_PRODUCT_URL,
  imageName: "ikea-fit",
  priceMinor: 12_900,
  dimensions: { widthMm: 600, heightMm: 1_700, depthMm: 280 },
  fit: { width: 235, height: 65, depth: 25, minimum: 25 },
  packages: [{ widthMm: 1_720, heightMm: 70, depthMm: 290, label: "Flat pack" }],
  access: {
    status: "passed",
    passes: true,
    basis: "package",
    accessWidthMm: 820,
    crossSection: [
      { axis: "height", sizeMm: 70 },
      { axis: "depth", sizeMm: 290 },
    ],
    clearanceMm: 440,
    controllingPackageIndex: 0,
    controllingPackageLabel: "Flat pack",
  },
});

const kmartFitCandidate = candidate({
  id: KMART_FIT_ID,
  rank: 1,
  retailer: { key: "kmart-au", label: "Kmart Australia", host: "kmart.com.au" },
  retailerProductId: "KMART-E2E-1",
  name: "Kmart slim cube shelf",
  productUrl: "https://www.kmart.com.au/product/slim-cube-shelf-e2e/",
  imageName: "kmart-fit",
  priceMinor: 8_900,
  dimensions: { widthMm: 580, heightMm: 1_650, depthMm: 270 },
  fit: { width: 255, height: 115, depth: 35, minimum: 35 },
});

const accessCandidate = candidate({
  id: ACCESS_ID,
  rank: 2,
  fitStatus: "access_issue",
  retailer: { key: "kmart-au", label: "Kmart Australia", host: "kmart.com.au" },
  retailerProductId: "KMART-E2E-2",
  name: "Wide modular shelf",
  productUrl: "https://www.kmart.com.au/product/wide-modular-shelf-e2e/",
  imageName: "access",
  priceMinor: 10_900,
  dimensions: { widthMm: 790, heightMm: 1_600, depthMm: 280 },
  fit: { width: 45, height: 165, depth: 25, minimum: 25 },
  access: {
    status: "failed",
    passes: false,
    basis: "assembled-advisory",
    accessWidthMm: 820,
    crossSection: [
      { axis: "depth", sizeMm: 280 },
      { axis: "width", sizeMm: 790 },
    ],
    deficitMm: 35,
    reason: "Fits the space, but 35 mm too wide for the 820 mm access opening.",
  },
});

const nearCandidate = candidate({
  id: NEAR_ID,
  rank: 3,
  fitStatus: "near_miss",
  retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
  retailerProductId: "IKEA-E2E-2",
  name: "Tall display shelf",
  productUrl: "https://www.ikea.com/au/en/p/tall-display-shelf-e2e/",
  imageName: "near",
  priceMinor: 14_900,
  dimensions: { widthMm: 600, heightMm: 1_800, depthMm: 280 },
  fit: { width: 235, height: -35, depth: 25, minimum: -35 },
  fitReasons: ["35 mm too tall."],
});

const linkedCandidate = candidate({
  id: LINKED_ID,
  rank: 0,
  retailer: {
    key: "temple-and-webster-au",
    label: "Temple & Webster",
    host: "templeandwebster.com.au",
  },
  retailerProductId: "CNB100-OAK",
  name: "Carter narrow bookcase",
  productUrl: "https://www.templeandwebster.com.au/Carter-Bookcase-Canonical-CNB100.html?colour=oak",
  imageName: "linked",
  priceMinor: 19_900,
  dimensions: { widthMm: 620, heightMm: 1_680, depthMm: 280 },
  fit: { width: 215, height: 85, depth: 25, minimum: 25 },
});

const LIVE_CANDIDATES = [
  ikeaFitCandidate,
  kmartFitCandidate,
  accessCandidate,
  nearCandidate,
] as const;

function candidate({
  id,
  rank,
  retailer,
  retailerProductId,
  name,
  productUrl,
  imageName,
  priceMinor,
  dimensions,
  fit,
  fitStatus = "fits",
  fitReasons = [],
  packages = [],
  access,
}: {
  readonly id: string;
  readonly rank: number;
  readonly retailer: { readonly key: string; readonly label: string; readonly host: string };
  readonly retailerProductId: string;
  readonly name: string;
  readonly productUrl: string;
  readonly imageName: string;
  readonly priceMinor: number;
  readonly dimensions: { readonly widthMm: number; readonly heightMm: number; readonly depthMm: number };
  readonly fit: { readonly width: number; readonly height: number; readonly depth: number; readonly minimum: number };
  readonly fitStatus?: "fits" | "access_issue" | "near_miss";
  readonly fitReasons?: readonly string[];
  readonly packages?: readonly Record<string, unknown>[];
  readonly access?: Record<string, unknown>;
}): Record<string, unknown> {
  const defaultAccess = fitStatus === "near_miss"
    ? { status: "skipped", passes: true, basis: "unknown" }
    : {
        status: "passed",
        passes: true,
        basis: "assembled-advisory",
        accessWidthMm: 820,
        crossSection: [
          { axis: "depth", sizeMm: dimensions.depthMm },
          { axis: "width", sizeMm: dimensions.widthMm },
        ],
        clearanceMm: Math.max(0, 780 - dimensions.widthMm),
      };
  return {
    id,
    rank,
    fitStatus,
    observation: {
      retailer,
      retailerProductId,
      name,
      category: "bookcase",
      productUrl,
      imageUrl: `https://images.example.test/${imageName}.jpg`,
      priceMinor,
      currency: "AUD",
      availability: "in_stock",
      assembledDimensions: dimensions,
      packages,
      dimensionsSource: "retailer-page",
      dimensionsEvidence: `Width: ${dimensions.widthMm} mm; Height: ${dimensions.heightMm} mm; Depth: ${dimensions.depthMm} mm.`,
      observedAt: CHECKED_AT,
      confidence: "high",
    },
    fit: {
      fits: fitStatus !== "near_miss",
      orientation: "default",
      widthClearanceMm: fit.width,
      heightClearanceMm: fit.height,
      depthClearanceMm: fit.depth,
      minimumClearanceMm: fit.minimum,
      confidence: "high",
      reasons: fitReasons,
    },
    access: access ?? defaultAccess,
  };
}

function sharedComparisonDocument(): string {
  return `<!doctype html>
    <html lang="en-AU">
      <head><meta charset="utf-8"><title>Shared furniture comparison · Fitment</title></head>
      <body>
        <main>
          <p>FITMENT · Read-only shared comparison</p>
          <h1>Clearance comparison</h1>
          <p>900 W × 1800 H × 350 D mm</p>
          <article><h2>BILLY narrow bookcase</h2><p>25 mm minimum clearance</p></article>
          <article><h2>Kmart slim cube shelf</h2><p>35 mm minimum clearance</p></article>
          <a href="/fit?new=1">Use my space</a>
        </main>
      </body>
    </html>`;
}
