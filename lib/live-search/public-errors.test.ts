import { describe, expect, it } from "vitest";
import { publicWorkflowErrorMessage } from "./public-errors";

describe("publicWorkflowErrorMessage", () => {
  it("turns provider terminal states into useful recovery copy", () => {
    expect(publicWorkflowErrorMessage("browser_budget_exhausted")).toContain(
      "reached its browsing limit",
    );
    expect(publicWorkflowErrorMessage("browser_timed_out")).toContain("took too long");
    expect(publicWorkflowErrorMessage("browser_invalid_output")).toContain(
      "source-backed dimensions",
    );
  });

  it("never echoes an unknown provider message", () => {
    expect(publicWorkflowErrorMessage("browser_stopped")).toBe(
      "The retailer check ended before validated products were ready. Try a shorter, more specific search.",
    );
    expect(publicWorkflowErrorMessage(undefined)).not.toContain("undefined");
  });
});
