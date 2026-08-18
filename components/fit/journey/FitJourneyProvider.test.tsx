import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_SPACE_MEASUREMENT } from "@/lib/fit-config";
import {
  createSavedSpace,
  SAVED_SPACES_STORAGE_KEY,
} from "@/lib/saved-spaces";
import { FitJourneyProvider, useFitJourney } from "./FitJourneyProvider";

const MANUAL_MEASUREMENT = {
  ...DEMO_SPACE_MEASUREMENT,
  source: "manual",
} as const;

function Harness(): React.JSX.Element {
  const journey = useFitJourney();
  return (
    <div>
      <span data-testid="ready">{String(journey.ready)}</span>
      <span data-testid="active">{journey.activeSpace?.name ?? "none"}</span>
      <span data-testid="count">{journey.savedSpaces.length}</span>
      <button
        type="button"
        onClick={() => journey.saveSpace(MANUAL_MEASUREMENT)}
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          const id = journey.activeSpace?.id;
          if (id !== undefined) {
            journey.saveSpace(
              { ...MANUAL_MEASUREMENT, widthMm: 1_000 },
              id,
            );
          }
        }}
      >
        Update
      </button>
      <button
        type="button"
        onClick={() =>
          journey.saveComparison("00000000-0000-4000-8000-000000000001", [
            "00000000-0000-4000-8000-000000000002",
            "00000000-0000-4000-8000-000000000003",
          ])
        }
      >
        Compare
      </button>
      <span data-testid="comparison">
        {journey
          .readComparison("00000000-0000-4000-8000-000000000001")
          .join(",")}
      </span>
    </div>
  );
}

describe("FitJourneyProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("becomes ready when the browser blocks local storage", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });

    render(
      <FitJourneyProvider>
        <Harness />
      </FitJourneyProvider>,
    );

    expect(await screen.findByTestId("ready")).toHaveTextContent("true");
    expect(screen.getByTestId("active")).toHaveTextContent("none");
  });

  it("selects the newest valid saved space on first load", async () => {
    const older = createSavedSpace("Older", MANUAL_MEASUREMENT, {
      id: "older",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    const newest = createSavedSpace("Newest", MANUAL_MEASUREMENT, {
      id: "newest",
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    window.localStorage.setItem(
      SAVED_SPACES_STORAGE_KEY,
      JSON.stringify([older, newest]),
    );

    render(
      <FitJourneyProvider>
        <Harness />
      </FitJourneyProvider>,
    );

    expect(await screen.findByTestId("active")).toHaveTextContent("Newest");
    expect(screen.getByTestId("ready")).toHaveTextContent("true");
  });

  it("updates the current space without creating a duplicate", async () => {
    render(
      <FitJourneyProvider>
        <Harness />
      </FitJourneyProvider>,
    );

    await act(async () => screen.getByRole("button", { name: "Save" }).click());
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    await act(async () => screen.getByRole("button", { name: "Update" }).click());
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    const stored = JSON.parse(
      window.localStorage.getItem(SAVED_SPACES_STORAGE_KEY) ?? "[]",
    ) as Array<{ measurement: { widthMm: number } }>;
    expect(stored[0]?.measurement.widthMm).toBe(1_000);
  });

  it("persists at most two validated comparison choices", async () => {
    render(
      <FitJourneyProvider>
        <Harness />
      </FitJourneyProvider>,
    );
    await act(async () => screen.getByRole("button", { name: "Compare" }).click());
    expect(
      window.sessionStorage.getItem(
        "fitment.comparison.v1:00000000-0000-4000-8000-000000000001",
      ),
    ).toBe(
      '["00000000-0000-4000-8000-000000000002","00000000-0000-4000-8000-000000000003"]',
    );
  });
});
