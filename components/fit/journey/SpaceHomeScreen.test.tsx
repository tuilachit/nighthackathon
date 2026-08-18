import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createSavedSpace,
  persistSavedSpaces,
} from "@/lib/saved-spaces";
import { FitJourneyProvider } from "./FitJourneyProvider";
import { SpaceHomeScreen } from "./SpaceHomeScreen";

const MEASUREMENT = {
  widthMm: 900,
  heightMm: 1800,
  depthMm: 350,
  accessWidthMm: 820,
  uncertaintyMm: 25,
  source: "manual" as const,
};

describe("SpaceHomeScreen", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("gives a first visitor one primary route to enter their space", async () => {
    renderHome();

    expect(
      await screen.findByRole("heading", { name: "Start with your space" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add your space" })).toHaveAttribute(
      "href",
      "/fit/space",
    );
    expect(
      screen.getByRole("link", { name: "Try the demo space" }),
    ).toHaveAttribute("href", "/fit/demo/results?tier=fits");
  });

  it("opens on the latest saved measurement and exposes edit and search", async () => {
    const saved = createSavedSpace("Hallway", MEASUREMENT, {
      id: "space-hallway",
      createdAt: "2026-08-18T00:00:00.000Z",
    });
    persistSavedSpaces(window.localStorage, [saved]);
    renderHome();

    expect(
      await screen.findByRole("heading", { name: "Use this space?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Hallway")).toBeInTheDocument();
    expect(screen.getByText(/900 W × 1800 H × 350 D mm/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/fit/space?edit=space-hallway",
    );
    expect(screen.getByRole("link", { name: "Use this space" })).toHaveAttribute(
      "href",
      "/fit/search",
    );
  });

  it("keeps an exact-link request through space selection", async () => {
    render(
      <FitJourneyProvider>
        <SpaceHomeScreen initialMode="link" />
      </FitJourneyProvider>,
    );

    expect(
      await screen.findByRole("link", { name: "Add your space" }),
    ).toHaveAttribute("href", "/fit/space?mode=link");
  });

  it("keeps exact-link mode when editing a selected space", async () => {
    const saved = createSavedSpace("Hallway", MEASUREMENT, {
      id: "space-hallway",
      createdAt: "2026-08-18T00:00:00.000Z",
    });
    persistSavedSpaces(window.localStorage, [saved]);
    render(
      <FitJourneyProvider>
        <SpaceHomeScreen initialMode="link" />
      </FitJourneyProvider>,
    );

    expect(await screen.findByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/fit/space?edit=space-hallway&mode=link",
    );
    expect(screen.getByRole("link", { name: "Use this space" })).toHaveAttribute(
      "href",
      "/fit/search?mode=link",
    );
  });
});

function renderHome(): void {
  render(
    <FitJourneyProvider>
      <SpaceHomeScreen />
    </FitJourneyProvider>,
  );
}
