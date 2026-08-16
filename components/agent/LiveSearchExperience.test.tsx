import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveCandidate, LiveSearchWorkflow } from "@/lib/live-search/types";
import { LiveSearchExperience } from "./LiveSearchExperience";
import {
  approveLiveCandidate,
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
  createLiveSearch: vi.fn(),
  getLiveSearch: vi.fn(),
  startGuestSession: vi.fn(),
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

const baseObservation: LiveCandidate["observation"] = {
  retailer: "ikea-au",
  retailerProductId: "AU-100",
  name: "BILLY narrow bookcase",
  category: "bookcase",
  productUrl: "https://www.ikea.com/au/en/p/billy-bookcase-100/",
  imageUrl: "https://www.ikea.com/au/en/images/products/billy.jpg",
  priceMinor: 12900,
  currency: "AUD",
  availability: "in_stock",
  assembledDimensions: { widthMm: 600, heightMm: 1700, depthMm: 280 },
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
    retailer: "kmart-au",
    retailerProductId: "KM-200",
    name: "Wide modular shelf",
    productUrl: "https://www.kmart.com.au/product/wide-modular-shelf-200/",
    imageUrl: "https://www.kmart.com.au/images/wide-modular-shelf.jpg",
  },
  access: {
    status: "failed",
    passes: false,
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
  access: { status: "skipped", passes: true },
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
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "turnstile-site-key";
    vi.resetAllMocks();
    vi.mocked(startGuestSession).mockResolvedValue(undefined);
    vi.mocked(createLiveSearch).mockResolvedValue({
      workflowId: WORKFLOW_ID,
      state: "queued",
      reused: false,
    });
    vi.mocked(getLiveSearch).mockResolvedValue(readyWorkflow);
    vi.mocked(approveLiveCandidate).mockResolvedValue({
      workflowId: WORKFLOW_ID,
      candidateId: FIT_ID,
      state: "approved",
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

    await screen.findByText("Secure guest session ready");
    await user.type(screen.getByLabelText(/^What are you looking for\?/), "narrow oak bookcase under $300");
    await user.type(screen.getByLabelText(/^Width/), "900");
    await user.type(screen.getByLabelText(/^Height/), "1800");
    await user.type(screen.getByLabelText(/^Depth/), "350");
    await user.type(screen.getByLabelText(/^Access \(optional\)/), "820");
    await user.click(screen.getByRole("button", { name: "Search live retailer products" }));

    await waitFor(() => {
      expect(createLiveSearch).toHaveBeenCalledWith(
        {
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
        },
        expect.stringMatching(/^search-[0-9a-f]{36}$/),
      );
    });

    expect(await screen.findByRole("heading", { name: "Fits" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fits the space, access issue" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Near misses" })).toBeInTheDocument();
    expect(screen.getByText("Fits the space, but 35 mm too wide for the 820 mm access opening.")).toBeInTheDocument();
    expect(screen.getByText("35 mm too tall.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Approve and generate 3D" })).toHaveLength(1);

    const accessCard = screen.getByTestId(`live-candidate-${ACCESS_ID}`);
    const nearCard = screen.getByTestId(`live-candidate-${NEAR_ID}`);
    expect(within(accessCard).queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    expect(within(nearCard).queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
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
    await screen.findByText("Secure guest session ready");
    await submitValidSearch(user);
    await user.click(await screen.findByRole("button", { name: "Approve and generate 3D" }));

    await waitFor(() => expect(approveLiveCandidate).toHaveBeenCalledWith(
      WORKFLOW_ID,
      FIT_ID,
      expect.stringMatching(/^approval-[0-9a-f]{36}$/),
    ));
    expect(await screen.findByText("Bounding-box scale checked · GLB")).toBeInTheDocument();
    expect(screen.getByText(/AI-generated geometry published at/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open model asset ↗" })).toHaveAttribute(
      "href",
      "https://models.example.com/billy.glb",
    );
    expect(document.querySelector("model-viewer")).toHaveAttribute(
      "src",
      "https://models.example.com/billy.glb",
    );
  });

  it("rejects incomplete measurements before making a retailer request", async () => {
    const user = userEvent.setup();
    render(<LiveSearchExperience />);
    await screen.findByText("Secure guest session ready");
    await user.type(screen.getByLabelText(/^What are you looking for\?/), "shelf");
    await user.click(screen.getByRole("button", { name: "Search live retailer products" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Width, height and depth must each be whole millimetres from 100 to 10,000.",
    );
    expect(createLiveSearch).not.toHaveBeenCalled();
  });

  it("labels incomplete retailer coverage without hiding valid results", async () => {
    const user = userEvent.setup();
    vi.mocked(getLiveSearch).mockResolvedValue({
      ...readyWorkflow,
      isPartial: true,
      coverageNotes: ["No validated results returned for: kmart-au."],
    });

    render(<LiveSearchExperience />);
    await screen.findByText("Secure guest session ready");
    await submitValidSearch(user);

    expect(await screen.findByText("Partial retailer coverage.")).toBeInTheDocument();
    expect(screen.getByText("No validated results returned for: kmart-au.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fits" })).toBeInTheDocument();
  });

  it("hydrates results when an idempotent search is already ready", async () => {
    const user = userEvent.setup();
    vi.mocked(createLiveSearch).mockResolvedValue({
      workflowId: WORKFLOW_ID,
      state: "ready_for_approval",
      reused: true,
    });

    render(<LiveSearchExperience />);
    await screen.findByText("Secure guest session ready");
    await submitValidSearch(user);

    expect(await screen.findByRole("heading", { name: "Fits" })).toBeInTheDocument();
    expect(getLiveSearch).toHaveBeenCalledWith(WORKFLOW_ID);
  });
});

async function submitValidSearch(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText(/^What are you looking for\?/), "narrow oak bookcase under $300");
  await user.type(screen.getByLabelText(/^Width/), "900");
  await user.type(screen.getByLabelText(/^Height/), "1800");
  await user.type(screen.getByLabelText(/^Depth/), "350");
  await user.type(screen.getByLabelText(/^Access \(optional\)/), "820");
  await user.click(screen.getByRole("button", { name: "Search live retailer products" }));
}
