import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveCandidate, LiveSearchWorkflow } from "@/lib/live-search/types";
import { captureProductEvent } from "@/lib/product-events-client";
import { LiveSearchExperience } from "./LiveSearchExperience";
import {
  approveLiveCandidate,
  cancelLiveSearch,
  createComparisonShare,
  createLiveSearch,
  getLiveSearch,
  LiveSearchApiError,
  startGuestSession,
} from "./live-search-api";

vi.mock("./live-search-api", () => ({
  LiveSearchApiError: class LiveSearchApiError extends Error {
    public constructor(
      message: string,
      public readonly code: string,
      public readonly status: number,
    ) {
      super(message);
    }
  },
  approveLiveCandidate: vi.fn(),
  cancelLiveSearch: vi.fn(),
  createComparisonShare: vi.fn(),
  createLiveSearch: vi.fn(),
  getLiveSearch: vi.fn(),
  startGuestSession: vi.fn(),
}));

vi.mock("@/lib/product-events-client", () => ({
  captureProductEvent: vi.fn(),
}));

vi.mock("./TurnstileChallenge", () => ({
  TurnstileChallenge: ({ onToken }: { readonly onToken: (token: string) => void }) => (
    <button type="button" onClick={() => onToken("turnstile-test-token-at-least-twenty-characters")}>
      Complete human check
    </button>
  ),
}));

const WORKFLOW_ID = "00000000-0000-4000-8000-000000000001";
const FIT_ID = "00000000-0000-4000-8000-000000000002";
const ACCESS_ID = "00000000-0000-4000-8000-000000000003";
const NEAR_ID = "00000000-0000-4000-8000-000000000004";
const ALTERNATIVE_WORKFLOW_ID = "00000000-0000-4000-8000-000000000006";
const ALTERNATIVE_ID = "00000000-0000-4000-8000-000000000007";

const baseObservation: LiveCandidate["observation"] = {
  retailer: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
  retailerProductId: "AU-100",
  name: "BILLY narrow bookcase",
  category: "bookcase",
  productUrl: "https://www.ikea.com/au/en/p/billy-bookcase-100/",
  imageUrl: "https://www.ikea.com/au/en/images/products/billy.jpg",
  priceMinor: 12900,
  currency: "AUD",
  availability: "in_stock",
  assembledDimensions: { widthMm: 600, heightMm: 1700, depthMm: 280 },
  packages: [],
  dimensionsSource: "retailer-page",
  dimensionsEvidence: "Width: 60 cm; height: 170 cm; depth: 28 cm.",
  observedAt: "2026-08-16T00:00:00.000Z",
  confidence: "high",
};

const fitCandidate: LiveCandidate = {
  id: FIT_ID,
  rank: 0,
  fitStatus: "fits",
  observation: baseObservation,
  fit: {
    fits: true,
    orientation: "default",
    widthClearanceMm: 235,
    heightClearanceMm: 65,
    depthClearanceMm: 25,
    minimumClearanceMm: 25,
    confidence: "high",
    reasons: [],
  },
  access: {
    status: "passed",
    passes: true,
    basis: "assembled-advisory",
    accessWidthMm: 820,
    crossSection: [
      { axis: "depth", sizeMm: 280 },
      { axis: "width", sizeMm: 600 },
    ],
    clearanceMm: 155,
  },
};

const accessCandidate: LiveCandidate = {
  ...fitCandidate,
  id: ACCESS_ID,
  rank: 1,
  fitStatus: "access_issue",
  observation: {
    ...baseObservation,
    retailer: { key: "kmart-au", label: "Kmart Australia", host: "kmart.com.au" },
    retailerProductId: "KM-200",
    name: "Wide modular shelf",
    productUrl: "https://www.kmart.com.au/product/wide-modular-shelf-200/",
    imageUrl: "https://www.kmart.com.au/images/wide-modular-shelf.jpg",
  },
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
};

const nearCandidate: LiveCandidate = {
  ...fitCandidate,
  id: NEAR_ID,
  rank: 2,
  fitStatus: "near_miss",
  observation: {
    ...baseObservation,
    retailerProductId: "AU-300",
    name: "Tall display shelf",
    productUrl: "https://www.ikea.com/au/en/p/tall-display-shelf-300/",
  },
  fit: {
    fits: false,
    orientation: "default",
    widthClearanceMm: 235,
    heightClearanceMm: -35,
    depthClearanceMm: 25,
    minimumClearanceMm: -35,
    confidence: "high",
    reasons: ["35 mm too tall."],
  },
  access: { status: "skipped", passes: true, basis: "unknown" },
};

const readyWorkflow: LiveSearchWorkflow = {
  id: WORKFLOW_ID,
  state: "ready_for_approval",
  queryText: "narrow oak bookcase under $300",
  measurement: {
    widthMm: 900,
    heightMm: 1800,
    depthMm: 350,
    accessWidthMm: 820,
    uncertaintyMm: 25,
    source: "manual",
  },
  retailers: ["ikea-au", "kmart-au"],
  candidates: [fitCandidate, accessCandidate, nearCandidate],
  isPartial: false,
  coverageNotes: [],
  createdAt: "2026-08-16T00:00:00.000Z",
  updatedAt: "2026-08-16T00:01:00.000Z",
};

describe("LiveSearchExperience", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/agent");
    window.sessionStorage.clear();
    setNavigatorOnline(true);
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "turnstile-site-key";
    vi.resetAllMocks();
    vi.mocked(startGuestSession).mockResolvedValue(undefined);
    vi.mocked(createLiveSearch).mockResolvedValue({
      workflowId: WORKFLOW_ID,
      state: "queued",
      reused: false,
      cacheHit: false,
      freshness: "live",
    });
    vi.mocked(getLiveSearch).mockResolvedValue(readyWorkflow);
    vi.mocked(approveLiveCandidate).mockResolvedValue({
      workflowId: WORKFLOW_ID,
      candidateId: FIT_ID,
      state: "approved",
    });
    vi.mocked(cancelLiveSearch).mockResolvedValue({
      workflowId: WORKFLOW_ID,
      state: "cancelled",
      alreadyTerminal: false,
      providerStop: "requested",
    });
    vi.mocked(createComparisonShare).mockResolvedValue({
      url: "https://fitment.example/fit/share/abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
      expiresAt: "2026-09-16T00:00:00.000Z",
    });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  });

  it("completes the human check before creating a clean visitor session", async () => {
    const user = userEvent.setup();
    vi.mocked(startGuestSession)
      .mockRejectedValueOnce(new LiveSearchApiError("Human check required", "captcha_required", 400))
      .mockResolvedValueOnce(undefined);

    render(<LiveSearchExperience />);

    expect(screen.getByText(/No retailer or model provider is contacted/)).toBeInTheDocument();
    expect(startGuestSession).not.toHaveBeenCalled();
    await submitValidSearch(user);
    expect(await screen.findByText("Human check required before live provider calls")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Complete human check" }));
    expect(await screen.findByText("Secure guest session ready")).toBeInTheDocument();
    expect(startGuestSession).toHaveBeenNthCalledWith(2, expect.any(AbortSignal), "turnstile-test-token-at-least-twenty-characters");
  });

  it("restores an owner-scoped paid workflow from the URL after reload", async () => {
    window.history.replaceState(null, "", `/agent?job=${WORKFLOW_ID}`);

    render(<LiveSearchExperience />);

    expect(await screen.findByRole("heading", { name: "Fits" })).toBeInTheDocument();
    expect(getLiveSearch).toHaveBeenCalledWith(WORKFLOW_ID, expect.any(AbortSignal));
    expect(window.sessionStorage.getItem("fitment.live-workflow-id")).toBe(WORKFLOW_ID);
    expect(window.location.search).toBe(`?job=${WORKFLOW_ID}`);
  });

  it("preserves the paid workflow handle through a transient restore failure", async () => {
    window.history.replaceState(null, "", `/agent?job=${WORKFLOW_ID}`);
    vi.mocked(getLiveSearch).mockRejectedValue(
      new LiveSearchApiError("Temporarily unavailable", "internal_error", 503),
    );

    const view = render(<LiveSearchExperience />);

    await waitFor(() => expect(getLiveSearch).toHaveBeenCalled());
    expect(window.location.search).toBe(`?job=${WORKFLOW_ID}`);
    expect(window.sessionStorage.getItem("fitment.live-workflow-id")).toBeNull();
    expect(screen.queryByText(/saved live search is not available/i)).not.toBeInTheDocument();
    view.unmount();
  });

  it("clears a saved workflow only when ownership is definitively unavailable", async () => {
    window.history.replaceState(null, "", `/agent?job=${WORKFLOW_ID}`);
    vi.mocked(getLiveSearch).mockRejectedValue(
      new LiveSearchApiError("Not found", "not_found", 404),
    );

    render(<LiveSearchExperience />);

    expect(await screen.findByText("That saved live search is not available for this guest session.")).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(window.sessionStorage.getItem("fitment.live-workflow-id")).toBeNull();
  });

  it("submits manual measurements and separates fits from non-approvable results", async () => {
    const user = userEvent.setup();
    render(<LiveSearchExperience />);

    await user.type(screen.getByLabelText(/^What should fit here\?/), "narrow oak bookcase under $300");
    await user.type(screen.getByLabelText(/^Width/), "900");
    await user.type(screen.getByLabelText(/^Height/), "1800");
    await user.type(screen.getByLabelText(/^Depth/), "350");
    await user.type(screen.getByLabelText(/^Access \(optional\)/), "820");
    await user.click(screen.getByRole("button", { name: "Search current retailer products" }));

    await waitFor(() => {
      expect(createLiveSearch).toHaveBeenCalledWith(
        {
          intent: {
            kind: "prompt",
            text: "narrow oak bookcase under $300",
            retailers: ["ikea-au", "kmart-au"],
          },
          measurement: {
            widthMm: 900,
            heightMm: 1800,
            depthMm: 350,
            accessWidthMm: 820,
            uncertaintyMm: 25,
            source: "manual",
          },
          cachePolicy: "prefer-recent",
        },
        expect.stringMatching(/^search-[0-9a-f]{36}$/),
      );
    });

    expect(await screen.findByRole("heading", { name: "Fits" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fits the space, access issue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Near misses" })).toBeInTheDocument();
    expect(screen.getByText("Fits the space, but 35 mm too wide for the 820 mm access opening.")).toBeInTheDocument();
    expect(screen.getByText("35 mm too tall.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Review for 3D" })).toHaveLength(1);

    const accessCard = screen.getByTestId(`live-candidate-${ACCESS_ID}`);
    const nearCard = screen.getByTestId(`live-candidate-${NEAR_ID}`);
    expect(within(accessCard).queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    expect(within(nearCard).queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    await user.click(within(screen.getByTestId(`live-candidate-${FIT_ID}`)).getByRole("link", { name: "View at retailer ↗" }));
    expect(captureProductEvent).toHaveBeenCalledWith(
      "retailer_outbound",
      { retailer: "ikea-au", surface: "card", tier: "fits" },
    );
  });

  it("restores a lost pre-acknowledgement submission with the same idempotency key", async () => {
    const user = userEvent.setup();
    vi.mocked(createLiveSearch)
      .mockImplementationOnce(async (_request, idempotencyKey) => {
        const stored = JSON.parse(
          window.sessionStorage.getItem("fitment.pending-search-v1") ?? "null",
        ) as { readonly idempotencyKey?: string; readonly state?: string } | null;
        expect(stored).toMatchObject({ idempotencyKey, state: "posting" });
        throw new TypeError("Acknowledgement connection lost");
      })
      .mockResolvedValueOnce({
        workflowId: WORKFLOW_ID,
        state: "queued",
        reused: true,
        cacheHit: false,
        freshness: "live",
      });

    const firstRender = render(<LiveSearchExperience />);
    await submitValidSearch(user);

    expect(await screen.findByText("Acknowledgement connection lost")).toBeInTheDocument();
    const firstRequest = vi.mocked(createLiveSearch).mock.calls[0];
    const storedAfterLoss = JSON.parse(
      window.sessionStorage.getItem("fitment.pending-search-v1") ?? "null",
    ) as {
      readonly state?: string;
      readonly idempotencyKey?: string;
      readonly request?: unknown;
    } | null;
    expect(storedAfterLoss).toMatchObject({
      state: "posting",
      idempotencyKey: firstRequest?.[1],
      request: firstRequest?.[0],
    });
    expect(screen.getByRole("button", { name: "Search acknowledgement pending" })).toBeDisabled();
    firstRender.unmount();

    render(<LiveSearchExperience />);

    await waitFor(() => expect(createLiveSearch).toHaveBeenCalledTimes(2));
    const secondRequest = vi.mocked(createLiveSearch).mock.calls[1];
    expect(secondRequest?.[0]).toEqual(firstRequest?.[0]);
    expect(secondRequest?.[1]).toBe(firstRequest?.[1]);
    expect(await screen.findByRole("heading", { name: "Fits" })).toBeInTheDocument();
    expect(window.sessionStorage.getItem("fitment.pending-search-v1")).toBeNull();
    const submittedEvent = vi.mocked(captureProductEvent).mock.calls.find(
      ([eventName]) => eventName === "search_submitted",
    );
    expect(submittedEvent?.[1]).not.toHaveProperty("query");
    expect(submittedEvent?.[1]).not.toHaveProperty("measurement");
  });

  it("uses a supplied space and leaves delivery access unassessed when it is unknown", async () => {
    const user = userEvent.setup();
    render(
      <LiveSearchExperience
        initialMeasurement={{
          widthMm: 900,
          heightMm: 1800,
          depthMm: 350,
          uncertaintyMm: 25,
          source: "manual",
        }}
        embedded
      />,
    );

    expect(screen.queryByLabelText(/^Width/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Access opening/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/^What should fit here\?/), "narrow shelf");
    await user.click(screen.getByRole("button", { name: "Search current retailer products" }));

    await waitFor(() => expect(createLiveSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        measurement: {
          widthMm: 900,
          heightMm: 1800,
          depthMm: 350,
          uncertaintyMm: 25,
          source: "manual",
        },
      }),
      expect.any(String),
    ));
  });

  it("submits an exact HTTPS link as a product-link intent", async () => {
    const user = userEvent.setup();
    render(
      <LiveSearchExperience
        initialMeasurement={readyWorkflow.measurement}
        embedded
      />,
    );

    await user.click(screen.getByRole("button", { name: "Check a product link" }));
    await user.type(
      screen.getByLabelText(/^Retailer product link/),
      "https://www.ikea.com/au/en/p/billy-bookcase-100/?variant=oak&utm_source=test",
    );
    expect(screen.getByText(/Exact link detected/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Search current retailer products" }));

    await waitFor(() => expect(createLiveSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: {
          kind: "product-link",
          url: "https://www.ikea.com/au/en/p/billy-bookcase-100?variant=oak",
        },
      }),
      expect.any(String),
    ));
  });

  it("honours link mode from the URL without submitting", () => {
    window.history.replaceState(null, "", "/fit?mode=link");

    render(
      <LiveSearchExperience
        initialMeasurement={readyWorkflow.measurement}
        embedded
      />,
    );

    expect(screen.getByRole("button", { name: "Check a product link" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/^Retailer product link/)).toBeInTheDocument();
    expect(createLiveSearch).not.toHaveBeenCalled();
  });

  it("accepts the backend-approved canonical redirect as the linked result", async () => {
    const user = userEvent.setup();
    const requestedUrl = "https://www.ikea.com/au/en/p/billy-bookcase-100?variant=oak";
    vi.mocked(getLiveSearch).mockResolvedValue({
      ...readyWorkflow,
      queryText: requestedUrl,
      intent: { kind: "product-link", url: requestedUrl },
      candidates: [
        {
          ...fitCandidate,
          observation: {
            ...fitCandidate.observation,
            productUrl: "https://m.ikea.com/au/en/p/billy-bookcase-canonical-100",
          },
        },
      ],
    });

    render(<LiveSearchExperience initialMeasurement={readyWorkflow.measurement} embedded />);
    await user.click(screen.getByRole("button", { name: "Check a product link" }));
    await user.type(screen.getByLabelText(/^Retailer product link/), requestedUrl);
    await user.click(screen.getByRole("button", { name: "Search current retailer products" }));

    expect(within(await screen.findByTestId(`live-candidate-${FIT_ID}`)).getByText("Linked product")).toBeInTheDocument();
  });

  it("keeps an exact-link result in its listed non-AUD currency", async () => {
    const user = userEvent.setup();
    const productUrl = "https://www.ikea.com/us/en/p/billy-bookcase-100";
    vi.mocked(getLiveSearch).mockResolvedValue({
      ...readyWorkflow,
      queryText: productUrl,
      intent: { kind: "product-link", url: productUrl },
      retailers: ["ikea-au"],
      candidates: [
        {
          ...fitCandidate,
          observation: {
            ...fitCandidate.observation,
            retailer: { key: "ikea-us", label: "IKEA United States", host: "ikea.com" },
            productUrl,
            currency: "USD",
          },
        },
      ],
    });

    render(
      <LiveSearchExperience
        initialMeasurement={readyWorkflow.measurement}
        embedded
      />,
    );
    await user.click(screen.getByRole("button", { name: "Check a product link" }));
    await user.type(screen.getByLabelText(/^Retailer product link/), productUrl);
    await user.click(screen.getByRole("button", { name: "Search current retailer products" }));

    const card = await screen.findByTestId(`live-candidate-${FIT_ID}`);
    expect(within(card).getByText("Linked product")).toBeInTheDocument();
    expect(within(card).getByText(/USD\s*129\.00/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Find comparable alternatives" }));
    expect(screen.getByRole("button", { name: "Describe what I need" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/^What should fit here\?/)).toHaveValue(
      "Comparable bookcase to BILLY narrow bookcase, listed at USD 129.00",
    );
    expect(createLiveSearch).toHaveBeenCalledTimes(1);
  });

  it("preserves an exact-link candidate across the editable alternatives search", async () => {
    const user = userEvent.setup();
    const productUrl = "https://www.ikea.com/au/en/p/billy-bookcase-100?variant=oak";
    const linkedWorkflow: LiveSearchWorkflow = {
      ...readyWorkflow,
      queryText: productUrl,
      intent: { kind: "product-link", url: productUrl },
      candidates: [
        {
          ...fitCandidate,
          observation: { ...fitCandidate.observation, productUrl },
        },
      ],
    };
    const alternativeCandidate: LiveCandidate = {
      ...fitCandidate,
      id: ALTERNATIVE_ID,
      observation: {
        ...fitCandidate.observation,
        retailer: { key: "kmart-au", label: "Kmart Australia", host: "kmart.com.au" },
        retailerProductId: "KM-400",
        name: "Kmart narrow bookcase",
        productUrl: "https://www.kmart.com.au/product/narrow-bookcase-400/",
      },
    };
    const alternativesWorkflow: LiveSearchWorkflow = {
      ...readyWorkflow,
      id: ALTERNATIVE_WORKFLOW_ID,
      intent: {
        kind: "prompt",
        text: "Comparable bookcase to BILLY narrow bookcase, listed at AUD 129.00",
        retailers: ["ikea-au", "kmart-au"],
      },
      candidates: [alternativeCandidate],
    };
    vi.mocked(createLiveSearch)
      .mockResolvedValueOnce({
        workflowId: WORKFLOW_ID,
        state: "queued",
        reused: false,
        cacheHit: false,
        freshness: "live",
      })
      .mockResolvedValueOnce({
        workflowId: ALTERNATIVE_WORKFLOW_ID,
        state: "queued",
        reused: false,
        cacheHit: false,
        freshness: "live",
      });
    vi.mocked(getLiveSearch)
      .mockResolvedValueOnce(linkedWorkflow)
      .mockResolvedValueOnce(alternativesWorkflow);

    render(<LiveSearchExperience initialMeasurement={readyWorkflow.measurement} embedded />);
    await user.click(screen.getByRole("button", { name: "Check a product link" }));
    await user.type(screen.getByLabelText(/^Retailer product link/), productUrl);
    await user.click(screen.getByRole("button", { name: "Search current retailer products" }));
    await screen.findByText("BILLY narrow bookcase");

    await user.click(screen.getByRole("button", { name: "Find comparable alternatives" }));
    expect(screen.getByLabelText(/^What should fit here\?/)).toHaveValue(
      "Comparable bookcase to BILLY narrow bookcase, listed at AUD 129.00",
    );
    expect(createLiveSearch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Search current retailer products" }));
    await screen.findByText("Kmart narrow bookcase");

    await user.click(screen.getByRole("button", { name: /Comparison register · 0\/3/ }));
    const comparison = screen.getByRole("region", { name: "Live product comparison" });
    expect(within(comparison).getByText("BILLY narrow bookcase")).toBeInTheDocument();
    expect(within(comparison).getByText("Kmart narrow bookcase")).toBeInTheDocument();
    expect(within(comparison).getByText("Exact-link product")).toBeInTheDocument();
    const reviewButtons = within(comparison).getAllByRole("button", { name: "Review for 3D" });
    expect(reviewButtons).toHaveLength(2);
    expect(reviewButtons[0]).toBeDisabled();
    expect(reviewButtons[1]).toBeEnabled();

    await user.click(within(comparison).getByRole("button", { name: "Share comparison" }));
    await waitFor(() => expect(createComparisonShare).toHaveBeenCalledWith([
      { workflowId: WORKFLOW_ID, candidateId: FIT_ID },
      { workflowId: ALTERNATIVE_WORKFLOW_ID, candidateId: ALTERNATIVE_ID },
    ]));
  });

  it("allows access issues and near misses into comparison without enabling generation", async () => {
    const user = userEvent.setup();
    render(<LiveSearchExperience />);
    await submitValidSearch(user);

    const accessCard = await screen.findByTestId(`live-candidate-${ACCESS_ID}`);
    const nearCard = screen.getByTestId(`live-candidate-${NEAR_ID}`);
    await user.click(within(accessCard).getByRole("button", { name: "Compare" }));
    await user.click(within(nearCard).getByRole("button", { name: "Compare" }));
    await user.click(screen.getByRole("button", { name: /Kmart Australia \/ IKEA Australia/ }));

    const comparison = screen.getByRole("region", { name: "Live product comparison" });
    expect(within(comparison).getByText("Wide modular shelf")).toBeInTheDocument();
    expect(within(comparison).getByText("Tall display shelf")).toBeInTheDocument();
    expect(within(comparison).getAllByRole("img", { name: /retailer product photo/ })).toHaveLength(2);
    expect(within(comparison).getAllByText(/\$129\.00/)).toHaveLength(2);
    expect(within(comparison).getAllByText("Listed in stock")).toHaveLength(2);
    expect(within(comparison).getAllByText("Package dimensions unavailable.")).toHaveLength(2);
    expect(within(comparison).getByText(/Failed · Fits the space, but 35 mm too wide/)).toBeInTheDocument();
    expect(within(comparison).getByText("Access not checked")).toBeInTheDocument();
    expect(within(comparison).getAllByText(baseObservation.dimensionsEvidence)).toHaveLength(2);
    expect(within(comparison).getAllByRole("link", { name: "View retailer source ↗" })).toHaveLength(2);
    expect(within(comparison).queryByRole("button", { name: "Review for 3D" })).not.toBeInTheDocument();
    expect(captureProductEvent).toHaveBeenCalledWith(
      "comparison_opened",
      expect.objectContaining({ selection: "manual", count: 2, cross_retailer: true }),
    );
  });

  it("moves an approved fit into a bounding-box scale-checked model view", async () => {
    const user = userEvent.setup();
    const assetWorkflow: LiveSearchWorkflow = {
      ...readyWorkflow,
      state: "asset_ready",
      approvedCandidateId: FIT_ID,
      candidates: [
        {
          ...fitCandidate,
          asset: {
            id: "00000000-0000-4000-8000-000000000005",
            kind: "glb",
            url: "https://models.example.com/billy.glb",
            dimensions: fitCandidate.observation.assembledDimensions,
            scaleVerified: true,
          },
        },
        accessCandidate,
        nearCandidate,
      ],
      updatedAt: "2026-08-16T00:03:00.000Z",
    };
    vi.mocked(getLiveSearch)
      .mockResolvedValueOnce(readyWorkflow)
      .mockResolvedValueOnce(assetWorkflow);

    render(<LiveSearchExperience />);
    await submitValidSearch(user);
    await user.click(await screen.findByRole("button", { name: "Review for 3D" }));
    expect(screen.getByText(/Expect a multi-minute wait after approval/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve and generate 3D" }));

    await waitFor(() => expect(approveLiveCandidate).toHaveBeenCalledWith(
      WORKFLOW_ID,
      FIT_ID,
      expect.stringMatching(/^approval-[0-9a-f]{36}$/),
    ));
    expect(captureProductEvent).toHaveBeenCalledWith(
      "candidate_approved",
      { retailer: "ikea-au", rank_bucket: "1" },
    );
    expect(await screen.findByText("Bounding-box scale checked · GLB")).toBeInTheDocument();
    expect(screen.getByText(/AI-generated geometry published at/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open model asset ↗" })).toHaveAttribute(
      "href",
      "https://models.example.com/billy.glb",
    );
    await waitFor(() => expect(document.querySelector("model-viewer")).not.toBeNull());
    expect(document.querySelector("model-viewer")).toHaveAttribute(
      "src",
      "https://models.example.com/billy.glb",
    );
    expect(captureProductEvent).toHaveBeenCalledWith(
      "model_ready",
      expect.objectContaining({ kind: "glb", scale_verified: true }),
    );
  });

  it("keeps loaded results visible but disables live provider actions offline", async () => {
    const user = userEvent.setup();
    render(<LiveSearchExperience />);
    await submitValidSearch(user);
    const fitCard = await screen.findByTestId(`live-candidate-${FIT_ID}`);

    setNavigatorOnline(false);
    window.dispatchEvent(new Event("offline"));

    expect(await screen.findByText("Offline.")).toBeInTheDocument();
    expect(fitCard).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search current retailer products" })).toBeDisabled();
    await user.click(within(fitCard).getByRole("button", { name: "Review for 3D" }));
    expect(screen.getByRole("button", { name: "Approve and generate 3D" })).toBeDisabled();

    setNavigatorOnline(true);
    window.dispatchEvent(new Event("online"));
    expect(await screen.findByRole("button", { name: "Search current retailer products" })).toBeEnabled();
  });

  it("lets the user explicitly require a live retailer refresh", async () => {
    const user = userEvent.setup();
    render(
      <LiveSearchExperience
        initialMeasurement={readyWorkflow.measurement}
        embedded
      />,
    );

    await user.type(screen.getByLabelText(/^What should fit here\?/), "narrow shelf");
    await user.click(screen.getByRole("radio", { name: /Check live/ }));
    await user.click(screen.getByRole("button", { name: "Search current retailer products" }));

    await waitFor(() => expect(createLiveSearch).toHaveBeenCalledWith(
      expect.objectContaining({ cachePolicy: "force-refresh" }),
      expect.any(String),
    ));
    expect(captureProductEvent).toHaveBeenCalledWith(
      "search_submitted",
      expect.objectContaining({ cache_policy: "force_refresh" }),
    );
  });

  it("blocks a second submit while the durable retailer workflow is active", async () => {
    const user = userEvent.setup();
    vi.mocked(getLiveSearch).mockResolvedValue({
      ...readyWorkflow,
      state: "searching",
      candidates: [],
    });
    render(<LiveSearchExperience />);
    await submitValidSearch(user);

    const activeSubmit = await screen.findByRole("button", { name: "Search in progress…" });
    expect(activeSubmit).toBeDisabled();
    expect(screen.getByText("Fresh retailer checks usually take tens of seconds.", { exact: false })).toBeInTheDocument();
    await screen.findByText("Retailer pages being checked");
    expect(screen.getByRole("list", { name: "Retailer-check progress" }).querySelectorAll("li")).toHaveLength(3);
    await user.click(activeSubmit);
    expect(createLiveSearch).toHaveBeenCalledTimes(1);
  });

  it("durably cancels an active owner workflow", async () => {
    const user = userEvent.setup();
    vi.mocked(getLiveSearch).mockResolvedValue({
      ...readyWorkflow,
      state: "searching",
      candidates: [],
    });
    render(<LiveSearchExperience />);
    await submitValidSearch(user);

    await user.click(await screen.findByRole("button", { name: "Cancel this job" }));

    await waitFor(() => expect(cancelLiveSearch).toHaveBeenCalledWith(WORKFLOW_ID));
    expect(screen.getByText(/job is durably cancelled/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel this job" })).not.toBeInTheDocument();
    expect(captureProductEvent).toHaveBeenCalledWith(
      "recovery_used",
      expect.objectContaining({ action: "cancel" }),
    );
  });

  it("creates an expiring read-only share from the compared live candidates", async () => {
    const user = userEvent.setup();
    render(<LiveSearchExperience />);
    await submitValidSearch(user);

    await user.click(await screen.findByRole("button", { name: /Comparison register · 0\/3/ }));
    expect(await screen.findByText(/read-only link replays this exact measurement/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Share comparison" }));

    await waitFor(() => expect(createComparisonShare).toHaveBeenCalledWith([
      { workflowId: WORKFLOW_ID, candidateId: FIT_ID },
      { workflowId: WORKFLOW_ID, candidateId: ACCESS_ID },
    ]));
    expect(screen.getByDisplayValue(/\/fit\/share\//)).toBeInTheDocument();
    expect(captureProductEvent).toHaveBeenCalledWith(
      "share_created",
      { surface: "link", compared_count: 2 },
    );
  });

  it("rejects incomplete measurements before making a retailer request", async () => {
    const user = userEvent.setup();
    render(<LiveSearchExperience />);
    await user.type(screen.getByLabelText(/^What should fit here\?/), "shelf");
    await user.click(screen.getByRole("button", { name: "Search current retailer products" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Width, height and depth must each be whole millimetres from 100 to 10,000.",
    );
    expect(createLiveSearch).not.toHaveBeenCalled();
    expect(startGuestSession).not.toHaveBeenCalled();
  });

  it("labels incomplete retailer coverage without hiding valid results", async () => {
    const user = userEvent.setup();
    vi.mocked(getLiveSearch).mockResolvedValue({
      ...readyWorkflow,
      isPartial: true,
      coverageNotes: ["No validated results returned for: kmart-au."],
    });

    render(<LiveSearchExperience />);
    await submitValidSearch(user);

    expect(await screen.findByText("Partial retailer coverage.")).toBeInTheDocument();
    expect(screen.getByText("No validated results returned for: kmart-au.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fits" })).toBeInTheDocument();
    expect(captureProductEvent).toHaveBeenCalledWith(
      "results_presented",
      expect.objectContaining({ coverage: "partial" }),
    );
  });

  it("hydrates results when an idempotent search is already ready", async () => {
    const user = userEvent.setup();
    vi.mocked(createLiveSearch).mockResolvedValue({
      workflowId: WORKFLOW_ID,
      state: "ready_for_approval",
      reused: true,
      cacheHit: true,
      freshness: "cached",
    });

    render(<LiveSearchExperience />);
    await submitValidSearch(user);

    expect(await screen.findByRole("heading", { name: "Fits" })).toBeInTheDocument();
    expect(getLiveSearch).toHaveBeenCalledWith(WORKFLOW_ID);
  });

  it("shows cached age and refreshes the same request with live retailer data", async () => {
    const user = userEvent.setup();
    const checkedAt = new Date(Date.now() - 3 * 60 * 60 * 1_000).toISOString();
    vi.mocked(getLiveSearch).mockResolvedValue({
      ...readyWorkflow,
      intent: {
        kind: "prompt",
        text: "narrow oak bookcase under $300",
        retailers: ["ikea-au", "kmart-au"],
      },
      cachePolicy: "prefer-recent",
      cacheHit: true,
      freshness: "cached",
      checkedAt,
    });

    render(<LiveSearchExperience />);
    await submitValidSearch(user);

    expect(await screen.findByText("Checked 3 hours ago")).toBeInTheDocument();
    setNavigatorOnline(false);
    window.dispatchEvent(new Event("offline"));
    expect(await screen.findByRole("button", { name: "Refresh retailer data" })).toBeDisabled();
    setNavigatorOnline(true);
    window.dispatchEvent(new Event("online"));
    await user.click(await screen.findByRole("button", { name: "Refresh retailer data" }));

    await waitFor(() => expect(createLiveSearch).toHaveBeenLastCalledWith(
      {
        intent: {
          kind: "prompt",
          text: "narrow oak bookcase under $300",
          retailers: ["ikea-au", "kmart-au"],
        },
        measurement: readyWorkflow.measurement,
        cachePolicy: "force-refresh",
      },
      expect.stringMatching(/^search-[0-9a-f]{36}$/),
    ));
    expect(createLiveSearch).toHaveBeenCalledTimes(2);
    expect(captureProductEvent).toHaveBeenCalledWith(
      "search_submitted",
      expect.objectContaining({ cache_policy: "force_refresh" }),
    );
  });
});

async function submitValidSearch(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(/^What should fit here\?/), "narrow oak bookcase under $300");
  await user.type(screen.getByLabelText(/^Width/), "900");
  await user.type(screen.getByLabelText(/^Height/), "1800");
  await user.type(screen.getByLabelText(/^Depth/), "350");
  await user.type(screen.getByLabelText(/^Access \(optional\)/), "820");
  await user.click(screen.getByRole("button", { name: "Search current retailer products" }));
}

function setNavigatorOnline(online: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: online,
  });
}
