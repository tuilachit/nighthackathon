import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notFound } from "next/navigation";
import { FitJourneyProvider } from "@/components/fit/journey/FitJourneyProvider";
import {
  createPendingMeasurementReviewDraft,
  persistPendingMeasurementReviewDraft,
} from "@/lib/pending-measurement-review";
import {
  createSavedSpace,
  loadSavedSpaces,
  persistSavedSpaces,
} from "@/lib/saved-spaces";
import FitCandidateReviewPage from "./(live)/jobs/[id]/candidates/[candidateId]/review/page";
import FitComparePage from "./(live)/jobs/[id]/compare/page";
import FitWorkflowPage from "./(live)/jobs/[id]/page";
import FitResultsPage from "./(live)/jobs/[id]/results/page";
import FitModelPage from "./(live)/jobs/[id]/model/page";
import FitSearchPage from "./(live)/search/page";
import FitSpacePage from "./space/page";
import FitSpaceReviewPage from "./space/review/page";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  useRouter: () => ({
    push: navigation.push,
    replace: navigation.replace,
  }),
}));

vi.mock("@/components/agent/LiveWorkflowRoute", () => ({
  LiveWorkflowRoute: ({
    workflowId,
    surface = "workflow",
    candidateId,
  }: {
    readonly workflowId?: string;
    readonly surface?: string;
    readonly candidateId?: string;
  }) => (
    <div
      data-testid="live-route"
      data-workflow-id={workflowId}
      data-surface={surface}
      data-candidate-id={candidateId}
    />
  ),
}));

const WORKFLOW_ID = "00000000-0000-4000-8000-000000000001";
const CANDIDATE_ID = "00000000-0000-4000-8000-000000000002";
const MEASUREMENT = {
  widthMm: 900,
  heightMm: 1800,
  depthMm: 350,
  accessWidthMm: 820,
  uncertaintyMm: 25,
  source: "manual" as const,
};

describe("split fit journey routes", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    navigation.push.mockReset();
    navigation.replace.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the dedicated input and restored-review route surfaces", async () => {
    const input = renderWithJourney(await fitSpacePage());
    expect(
      screen.getByRole("heading", { name: "Enter your space" }),
    ).toBeInTheDocument();
    input.unmount();

    persistPendingMeasurementReviewDraft(
      window.sessionStorage,
      createPendingMeasurementReviewDraft(MEASUREMENT, "cm"),
    );
    renderWithJourney(await fitSpaceReviewPage());

    expect(
      await screen.findByRole("heading", { name: "Check measurements" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Doorway")).toHaveValue(820);
  });

  it("carries a parsed measurement through review into the active saved space", async () => {
    const user = userEvent.setup();
    const input = renderWithJourney(await fitSpacePage());

    await user.type(
      screen.getByLabelText("Space and doorway measurements"),
      "90 cm wide, 180 high, 35 deep, doorway 82",
    );
    await user.click(
      screen.getByRole("button", { name: "Check measurements" }),
    );
    expect(navigation.push).toHaveBeenCalledWith("/fit/space/review");
    input.unmount();

    renderWithJourney(await fitSpaceReviewPage());
    await user.click(
      await screen.findByRole("button", { name: "Use this space" }),
    );

    expect(navigation.replace).toHaveBeenCalledWith("/fit/search");
    expect(loadSavedSpaces(window.localStorage)).toEqual([
      expect.objectContaining({ measurement: MEASUREMENT, name: "My space" }),
    ]);
  });

  it("keeps the measurement journey session-only when browser storage is blocked", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });

    const inputView = await fitSpacePage();
    const reviewView = await fitSpaceReviewPage();
    const view = render(
      <FitJourneyProvider>{inputView}</FitJourneyProvider>,
    );

    await user.type(
      await screen.findByLabelText("Space and doorway measurements"),
      "90 cm wide, 180 high, 35 deep, doorway 82",
    );
    await user.click(
      screen.getByRole("button", { name: "Check measurements" }),
    );

    view.rerender(
      <FitJourneyProvider>{reviewView}</FitJourneyProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Check measurements" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use this space" }));
    expect(navigation.replace).toHaveBeenCalledWith("/fit/search");
  });

  it("carries exact-link mode through measurement and review", async () => {
    const user = userEvent.setup();
    const input = renderWithJourney(await fitSpacePage({ mode: "link" }));

    expect(screen.getByRole("link", { name: "Space" })).toHaveAttribute(
      "href",
      "/fit?mode=link",
    );

    await user.type(
      screen.getByLabelText("Space and doorway measurements"),
      "90 cm wide, 180 high, 35 deep",
    );
    await user.click(
      screen.getByRole("button", { name: "Check measurements" }),
    );
    expect(navigation.push).toHaveBeenCalledWith(
      "/fit/space/review?mode=link",
    );
    input.unmount();

    renderWithJourney(await fitSpaceReviewPage({ mode: "link" }));
    await user.click(
      await screen.findByRole("button", { name: "Use this space" }),
    );

    expect(navigation.replace).toHaveBeenCalledWith("/fit/search?mode=link");
  });

  it("offers a deterministic recovery when no review draft exists", async () => {
    renderWithJourney(await fitSpaceReviewPage());

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/fit/space"),
    );
    expect(
      screen.queryByRole("heading", { name: "Check measurements" }),
    ).not.toBeInTheDocument();
  });

  it("restores the pending sentence when returning from review", async () => {
    persistPendingMeasurementReviewDraft(
      window.sessionStorage,
      createPendingMeasurementReviewDraft(MEASUREMENT, "cm"),
    );

    renderWithJourney(await fitSpacePage());

    expect(
      await screen.findByLabelText("Space and doorway measurements"),
    ).toHaveValue("width 90, height 180, depth 35, doorway 82 cm");
  });

  it("prefills and updates the requested saved space instead of duplicating it", async () => {
    const user = userEvent.setup();
    const existing = createSavedSpace("Hallway", MEASUREMENT, {
      id: "space-existing",
      createdAt: "2026-08-18T00:00:00.000Z",
    });
    persistSavedSpaces(window.localStorage, [existing]);

    const input = renderWithJourney(
      await fitSpacePage({ edit: "space-existing" }),
    );
    const sentence = await screen.findByLabelText(
      "Space and doorway measurements",
    );
    expect(sentence).toHaveValue(
      "width 90, height 180, depth 35, doorway 82 cm",
    );
    await user.clear(sentence);
    await user.type(
      sentence,
      "width 95cm, height 180cm, depth 35cm, doorway 82cm",
    );
    await user.click(
      screen.getByRole("button", { name: "Check measurements" }),
    );
    input.unmount();

    renderWithJourney(await fitSpaceReviewPage());
    await user.click(
      await screen.findByRole("button", { name: "Use this space" }),
    );

    expect(loadSavedSpaces(window.localStorage)).toEqual([
      {
        ...existing,
        measurement: { ...MEASUREMENT, widthMm: 950 },
      },
    ]);
  });

  it("wires search and each owner workflow surface", async () => {
    const params = Promise.resolve({ id: WORKFLOW_ID });
    const views = [
      await FitSearchPage({ searchParams: Promise.resolve({}) }),
      await FitWorkflowPage({ params }),
      await FitResultsPage({ params, searchParams: Promise.resolve({}) }),
      await FitComparePage({ params }),
      await FitCandidateReviewPage({
        params: Promise.resolve({ id: WORKFLOW_ID, candidateId: CANDIDATE_ID }),
      }),
      await FitModelPage({ params }),
    ];

    const { rerender } = render(views[0]);
    expect(screen.getByTestId("live-route")).toHaveAttribute("data-surface", "search");
    rerender(views[1]);
    expect(screen.getByTestId("live-route")).toHaveAttribute("data-workflow-id", WORKFLOW_ID);
    rerender(views[2]);
    expect(screen.getByTestId("live-route")).toHaveAttribute("data-surface", "results");
    rerender(views[3]);
    expect(screen.getByTestId("live-route")).toHaveAttribute("data-surface", "compare");
    rerender(views[4]);
    expect(screen.getByTestId("live-route")).toHaveAttribute("data-candidate-id", CANDIDATE_ID);
    rerender(views[5]);
    expect(screen.getByTestId("live-route")).toHaveAttribute("data-surface", "model");
  });

  it("fails closed for malformed workflow routes", async () => {
    await expect(FitWorkflowPage({
      params: Promise.resolve({ id: "../../admin" }),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});

function renderWithJourney(view: React.ReactNode) {
  return render(<FitJourneyProvider>{view}</FitJourneyProvider>);
}

function fitSpacePage(
  searchParams: {
    readonly edit?: string | readonly string[];
    readonly mode?: string | readonly string[];
  } = {},
): Promise<React.JSX.Element> {
  return FitSpacePage({ searchParams: Promise.resolve(searchParams) });
}

function fitSpaceReviewPage(
  searchParams: { readonly mode?: string | readonly string[] } = {},
): Promise<React.JSX.Element> {
  return FitSpaceReviewPage({ searchParams: Promise.resolve(searchParams) });
}
