import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useFitJourney } from "@/components/fit/journey/FitJourneyProvider";
import FitLayout from "./layout";

describe("FitLayout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("provides device-local journey state to every fit route", async () => {
    const { container } = render(
      <FitLayout>
        <JourneyProbe />
      </FitLayout>,
    );

    expect(container.firstElementChild).toHaveClass("fit-instrument");
    expect(await screen.findByText("Journey ready")).toBeInTheDocument();
  });
});

function JourneyProbe(): React.JSX.Element {
  const { ready } = useFitJourney();
  return <p>{ready ? "Journey ready" : "Journey loading"}</p>;
}
