import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FitJourneyProvider } from "@/components/fit/journey/FitJourneyProvider";
import { createSavedSpace, persistSavedSpaces } from "@/lib/saved-spaces";
import type { LiveCandidate, LiveSearchWorkflow } from "@/lib/live-search/types";
import {
  measurementKey,
  persistPendingSearch,
  persistLinkedCandidateReference,
  readLinkedCandidateReference,
  WORKFLOW_SESSION_KEY,
} from "./live-workflow-state";
import { LiveWorkflowController } from "./LiveWorkflowController";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  startGuestSession: vi.fn(),
  createLiveSearch: vi.fn(),
  getLiveSearch: vi.fn(),
  approveLiveCandidate: vi.fn(),
  cancelLiveSearch: vi.fn(),
  createComparisonShare: vi.fn(),
  captureProductEvent: vi.fn(),
  realtimeUpdate: undefined as (() => void) | undefined,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("./live-search-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./live-search-api")>()),
  startGuestSession: mocks.startGuestSession,
  createLiveSearch: mocks.createLiveSearch,
  getLiveSearch: mocks.getLiveSearch,
  approveLiveCandidate: mocks.approveLiveCandidate,
  cancelLiveSearch: mocks.cancelLiveSearch,
  createComparisonShare: mocks.createComparisonShare,
}));

vi.mock("@/lib/product-events-client", () => ({
  captureProductEvent: mocks.captureProductEvent,
}));

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    channel: () => ({
      on: function on(...args: readonly unknown[]) {
        mocks.realtimeUpdate = args[2] as (() => void) | undefined;
        return this;
      },
      subscribe: function subscribe() { return this; },
    }),
    removeChannel: vi.fn(),
  }),
}));

vi.mock("./TurnstileChallenge", () => ({
  TurnstileChallenge: ({ onToken }: { readonly onToken: (token?: string) => void }) => (
    <button type="button" onClick={() => onToken("captcha-token")}>Complete human check</button>
  ),
}));

const WORKFLOW_ID = "00000000-0000-4000-8000-000000000001";
const IKEA_ID = "00000000-0000-4000-8000-000000000002";
const KMART_ID = "00000000-0000-4000-8000-000000000003";
const LINK_WORKFLOW_ID = "00000000-0000-4000-8000-000000000005";
const ALTERNATIVES_WORKFLOW_ID = "00000000-0000-4000-8000-000000000006";
const MEASUREMENT = {
  widthMm: 900,
  heightMm: 1_800,
  depthMm: 350,
  accessWidthMm: 820,
  uncertaintyMm: 25,
  source: "manual",
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.realtimeUpdate = undefined;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/fit/search");
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: true,
  });
  persistSavedSpaces(window.localStorage, [
    createSavedSpace("Hallway", MEASUREMENT, {
      id: "space-one",
      createdAt: "2026-08-18T00:00:00.000Z",
    }),
  ]);
  mocks.startGuestSession.mockResolvedValue(undefined);
  mocks.createLiveSearch.mockResolvedValue({
    workflowId: WORKFLOW_ID,
    state: "queued",
    reused: false,
    cacheHit: false,
    freshness: "live",
  });
  mocks.getLiveSearch.mockResolvedValue(workflowFixture());
  mocks.approveLiveCandidate.mockResolvedValue({
    workflowId: WORKFLOW_ID,
    candidateId: IKEA_ID,
    state: "approved",
  });
});

describe("LiveWorkflowController", () => {
  it("does not create a session or contact a paid provider before submit", async () => {
    renderJourney(<LiveWorkflowController surface="search" />);

    expect(await screen.findByRole("heading", { name: "What should fit?" })).toBeVisible();
    expect(mocks.startGuestSession).not.toHaveBeenCalled();
    expect(mocks.createLiveSearch).not.toHaveBeenCalled();
    expect(mocks.approveLiveCandidate).not.toHaveBeenCalled();
  });

  it("blocks a second submission while a paid workflow handle is active", async () => {
    window.sessionStorage.setItem(WORKFLOW_SESSION_KEY, WORKFLOW_ID);
    persistPendingSearch({
      request: {
        intent: {
          kind: "prompt",
          text: "second shelf search",
          retailers: ["ikea-au", "kmart-au"],
        },
        measurement: MEASUREMENT,
        cachePolicy: "prefer-recent",
      },
      idempotencyKey: "search-pending-second-request",
      state: "awaiting-session",
    });

    renderJourney(<LiveWorkflowController surface="search" />);

    expect(
      await screen.findByRole("heading", { name: "Search still running" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Resume current check" })).toHaveAttribute(
      "href",
      `/fit/jobs/${WORKFLOW_ID}`,
    );
    expect(
      screen.queryByRole("button", { name: "Find products that fit" }),
    ).not.toBeInTheDocument();
    expect(mocks.startGuestSession).not.toHaveBeenCalled();
    expect(mocks.createLiveSearch).not.toHaveBeenCalled();
  });

  it("keeps a query-owned active job safe when session storage is blocked", async () => {
    window.history.replaceState(null, "", `/fit/search?job=${WORKFLOW_ID}`);
    const storageSpy = vi
      .spyOn(window, "sessionStorage", "get")
      .mockImplementation(() => {
        throw new DOMException("Storage is blocked", "SecurityError");
      });

    renderJourney(<LiveWorkflowController surface="search" />);

    expect(
      await screen.findByRole("heading", { name: "Search still running" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Resume current check" })).toHaveAttribute(
      "href",
      `/fit/jobs/${WORKFLOW_ID}`,
    );
    expect(mocks.createLiveSearch).not.toHaveBeenCalled();
    storageSpy.mockRestore();
  });

  it("replays one explicit pending search when the device reconnects", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
    persistPendingSearch({
      request: {
        intent: {
          kind: "prompt",
          text: "narrow shelf after reconnect",
          retailers: ["ikea-au", "kmart-au"],
        },
        measurement: MEASUREMENT,
        cachePolicy: "prefer-recent",
      },
      idempotencyKey: "search-reconnect-stable-key",
      state: "awaiting-session",
    });

    renderJourney(<LiveWorkflowController surface="search" />);

    expect(await screen.findByText("Loaded spaces remain available offline.")).toBeVisible();
    expect(mocks.createLiveSearch).not.toHaveBeenCalled();

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(mocks.createLiveSearch).toHaveBeenCalledOnce());
    expect(mocks.createLiveSearch.mock.calls[0]?.[1]).toBe(
      "search-reconnect-stable-key",
    );
  });

  it("creates exactly one durable search after the explicit action", async () => {
    renderJourney(<LiveWorkflowController surface="search" />);

    fireEvent.change(await screen.findByLabelText("What do you need?"), {
      target: { value: "narrow oak shelf" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Find products that fit" }),
    );

    await waitFor(() => expect(mocks.createLiveSearch).toHaveBeenCalledOnce());
    expect(mocks.startGuestSession).toHaveBeenCalledOnce();
    expect(mocks.createLiveSearch.mock.calls[0]?.[0]).toMatchObject({
      intent: { kind: "prompt", text: "narrow oak shelf" },
      measurement: MEASUREMENT,
    });
    expect(mocks.replace).toHaveBeenCalledWith(`/fit/jobs/${WORKFLOW_ID}`);
  });

  it("shows only the durable stage while a retailer check is running", async () => {
    mocks.getLiveSearch.mockResolvedValueOnce(workflowFixture({ state: "searching", candidates: [] }));
    renderJourney(
      <LiveWorkflowController workflowId={WORKFLOW_ID} surface="workflow" />,
    );

    expect(await screen.findByRole("heading", { name: "Checking retailers" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute(
      "href",
      `/fit/search?job=${WORKFLOW_ID}`,
    );
    expect(screen.queryByText("Products checked against your space")).not.toBeInTheDocument();
  });

  it("shows recovery copy without leaking provider progress text", async () => {
    mocks.getLiveSearch.mockResolvedValueOnce(workflowFixture({
      state: "failed",
      error: { code: "browser_stopped", message: "Running Python code" },
      candidates: [],
    }));
    renderJourney(
      <LiveWorkflowController workflowId={WORKFLOW_ID} surface="workflow" />,
    );

    expect(await screen.findByRole("heading", { name: "Search needs attention" })).toBeVisible();
    expect(screen.getByText(
      "The retailer check ended before validated products were ready. Try a shorter, more specific search.",
    )).toBeVisible();
    expect(screen.queryByText("Running Python code")).not.toBeInTheDocument();
  });

  it("never lets a slower workflow refresh overwrite a newer snapshot", async () => {
    mocks.getLiveSearch.mockResolvedValueOnce(workflowFixture({
      state: "searching",
      candidates: [],
      updatedAt: "2026-08-18T00:00:00.000Z",
    }));
    renderJourney(
      <LiveWorkflowController workflowId={WORKFLOW_ID} surface="workflow" />,
    );

    expect(await screen.findByRole("heading", { name: "Checking retailers" })).toBeVisible();
    await waitFor(() => expect(mocks.realtimeUpdate).toBeTypeOf("function"));

    const stale = deferred<LiveSearchWorkflow>();
    mocks.getLiveSearch
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(workflowFixture({
        state: "validating",
        candidates: [],
        updatedAt: "2026-08-18T00:02:00.000Z",
      }));

    act(() => {
      mocks.realtimeUpdate?.();
      mocks.realtimeUpdate?.();
    });

    expect(
      await screen.findByRole("heading", { name: "Validating dimensions" }),
    ).toBeVisible();

    await act(async () => {
      stale.resolve(workflowFixture({
        state: "searching",
        candidates: [],
        updatedAt: "2026-08-18T00:01:00.000Z",
      }));
      await stale.promise;
    });

    expect(screen.getByRole("heading", { name: "Validating dimensions" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Checking retailers" })).not.toBeInTheDocument();
  });

  it("binds a linked candidate to the acknowledged alternatives workflow", async () => {
    window.history.replaceState(
      null,
      "",
      `/fit/search?prefill=comparable+shelf&from=${LINK_WORKFLOW_ID}`,
    );
    persistLinkedCandidateReference({
      workflowId: LINK_WORKFLOW_ID,
      candidateId: IKEA_ID,
      measurementKey: measurementKey(MEASUREMENT),
    });
    mocks.createLiveSearch.mockResolvedValueOnce({
      workflowId: ALTERNATIVES_WORKFLOW_ID,
      state: "queued",
      reused: false,
      cacheHit: false,
      freshness: "live",
    });

    renderJourney(
      <LiveWorkflowController
        surface="search"
        initialValue="comparable shelf"
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Find products that fit" }),
    );

    await waitFor(() => expect(mocks.createLiveSearch).toHaveBeenCalledOnce());
    expect(readLinkedCandidateReference()).toMatchObject({
      workflowId: LINK_WORKFLOW_ID,
      candidateId: IKEA_ID,
      targetWorkflowId: ALTERNATIVES_WORKFLOW_ID,
    });
  });

  it("mounts results without the completed search and measurement screens", async () => {
    window.sessionStorage.setItem(WORKFLOW_SESSION_KEY, WORKFLOW_ID);
    renderJourney(
      <LiveWorkflowController workflowId={WORKFLOW_ID} surface="results" />,
    );

    expect(await screen.findByRole("heading", { name: "Choose what fits" })).toBeVisible();
    expect(await screen.findByText("IKEA narrow shelf")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "What should fit?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Checking retailers" })).not.toBeInTheDocument();
    expect(screen.queryByText("Kmart near miss")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(window.sessionStorage.getItem(WORKFLOW_SESSION_KEY)).toBeNull(),
    );
  });

  it("defaults comparison to two retailers and keeps generation approval explicit", async () => {
    const user = userEvent.setup();
    const { unmount } = renderJourney(
      <LiveWorkflowController workflowId={WORKFLOW_ID} surface="compare" />,
    );

    expect(await screen.findByRole("heading", { name: "Clearance comparison" })).toBeVisible();
    expect(screen.getAllByText("IKEA narrow shelf").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Kmart narrow shelf").length).toBeGreaterThan(0);
    expect(mocks.approveLiveCandidate).not.toHaveBeenCalled();
    unmount();

    renderJourney(
      <LiveWorkflowController
        workflowId={WORKFLOW_ID}
        surface="candidate-review"
        candidateId={IKEA_ID}
      />,
    );
    await user.click(
      await screen.findByRole("button", { name: "Approve and generate 3D" }),
    );
    await waitFor(() => expect(mocks.approveLiveCandidate).toHaveBeenCalledOnce());
  });

  it("keeps the exact linked item first in its scoped alternatives comparison", async () => {
    const linkedCandidate = candidateFixture(
      IKEA_ID,
      "Linked product near miss",
      "ikea-au",
      "near_miss",
      0,
    );
    persistLinkedCandidateReference({
      workflowId: LINK_WORKFLOW_ID,
      candidateId: IKEA_ID,
      measurementKey: measurementKey(MEASUREMENT),
      targetWorkflowId: ALTERNATIVES_WORKFLOW_ID,
    });
    mocks.getLiveSearch.mockImplementation((id: string) => {
      if (id === LINK_WORKFLOW_ID) {
        return Promise.resolve({
          ...workflowFixture({ candidates: [linkedCandidate] }),
          id: LINK_WORKFLOW_ID,
          queryText: linkedCandidate.observation.productUrl,
          intent: {
            kind: "product-link" as const,
            url: linkedCandidate.observation.productUrl,
          },
        });
      }
      return Promise.resolve({
        ...workflowFixture(),
        id: ALTERNATIVES_WORKFLOW_ID,
      });
    });

    renderJourney(
      <LiveWorkflowController
        workflowId={ALTERNATIVES_WORKFLOW_ID}
        surface="compare"
      />,
    );

    expect(await screen.findByRole("heading", { name: "Clearance comparison" })).toBeVisible();
    await waitFor(() => {
      const linked = screen.getByRole("heading", {
        level: 2,
        name: "Linked product near miss",
      });
      const alternative = screen.getByRole("heading", {
        level: 2,
        name: "Kmart narrow shelf",
      });
      expect(
        linked.compareDocumentPosition(alternative) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        screen.queryByRole("heading", { level: 2, name: "IKEA narrow shelf" }),
      ).not.toBeInTheDocument();
    });
  });

  it("does not leak a linked candidate into a later unrelated workflow", async () => {
    persistLinkedCandidateReference({
      workflowId: LINK_WORKFLOW_ID,
      candidateId: IKEA_ID,
      measurementKey: measurementKey(MEASUREMENT),
      targetWorkflowId: ALTERNATIVES_WORKFLOW_ID,
    });
    mocks.getLiveSearch.mockResolvedValue({
      ...workflowFixture(),
      id: WORKFLOW_ID,
    });

    renderJourney(
      <LiveWorkflowController workflowId={WORKFLOW_ID} surface="compare" />,
    );

    expect(await screen.findByRole("heading", { name: "Clearance comparison" })).toBeVisible();
    expect(screen.queryByText("Linked product near miss")).not.toBeInTheDocument();
    expect(mocks.getLiveSearch).toHaveBeenCalledOnce();
    expect(mocks.getLiveSearch).toHaveBeenCalledWith(WORKFLOW_ID, expect.any(AbortSignal));
  });
});

function renderJourney(view: React.ReactNode) {
  return render(<FitJourneyProvider>{view}</FitJourneyProvider>);
}

function workflowFixture({
  state = "ready_for_approval",
  candidates = [
    candidateFixture(IKEA_ID, "IKEA narrow shelf", "ikea-au", "fits", 0),
    candidateFixture(KMART_ID, "Kmart narrow shelf", "kmart-au", "fits", 1),
    candidateFixture(
      "00000000-0000-4000-8000-000000000004",
      "Kmart near miss",
      "kmart-au",
      "near_miss",
      2,
    ),
  ],
  updatedAt = "2026-08-18T00:00:00.000Z",
  error,
}: {
  readonly state?: LiveSearchWorkflow["state"];
  readonly candidates?: readonly LiveCandidate[];
  readonly updatedAt?: string;
  readonly error?: LiveSearchWorkflow["error"];
} = {}): LiveSearchWorkflow {
  return {
    id: WORKFLOW_ID,
    state,
    queryText: "narrow shelf",
    intent: {
      kind: "prompt",
      text: "narrow shelf",
      retailers: ["ikea-au", "kmart-au"],
    },
    measurement: MEASUREMENT,
    retailers: ["ikea-au", "kmart-au"],
    cachePolicy: "prefer-recent",
    cacheHit: false,
    freshness: "live",
    checkedAt: "2026-08-18T00:00:00.000Z",
    candidates,
    isPartial: false,
    coverageNotes: [],
    ...(error === undefined ? {} : { error }),
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt,
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function candidateFixture(
  id: string,
  name: string,
  retailer: "ikea-au" | "kmart-au",
  fitStatus: LiveCandidate["fitStatus"],
  rank: number,
): LiveCandidate {
  const fits = fitStatus !== "near_miss";
  return {
    id,
    rank,
    fitStatus,
    observation: {
      retailer: retailer === "ikea-au"
        ? { key: retailer, label: "IKEA Australia", host: "ikea.com" }
        : { key: retailer, label: "Kmart Australia", host: "kmart.com.au" },
      retailerProductId: id,
      name,
      category: "shelving",
      productUrl: retailer === "ikea-au"
        ? `https://www.ikea.com/au/en/p/${id}`
        : `https://www.kmart.com.au/product/${id}`,
      imageUrl: retailer === "ikea-au"
        ? `https://www.ikea.com/au/en/images/${id}.jpg`
        : `https://kmartau.mo.cloudinary.net/${id}.jpg`,
      priceMinor: retailer === "ikea-au" ? 12_900 : 9_900,
      currency: "AUD",
      availability: "in_stock",
      assembledDimensions: { widthMm: 600, heightMm: 1_600, depthMm: 280 },
      packages: [],
      dimensionsSource: "retailer-page",
      dimensionsEvidence: "Width 60 cm, height 160 cm, depth 28 cm.",
      observedAt: "2026-08-18T00:00:00.000Z",
      confidence: "high",
    },
    fit: {
      fits,
      orientation: "default",
      widthClearanceMm: fits ? 235 : -15,
      heightClearanceMm: 165,
      depthClearanceMm: 5,
      minimumClearanceMm: fits ? 5 : -15,
      confidence: "high",
      reasons: fits ? [] : ["15 mm too wide for the measured space."],
    },
    access: { status: "skipped", passes: true, basis: "unknown" },
  };
}
