import { describe, expect, it } from "vitest";
import {
  fitWorkflowPath,
  isFitWorkflowId,
  resolveAgentEntry,
  resolveFitEntry,
} from "./fit-route-contract";

const WORKFLOW_ID = "00000000-0000-4000-8000-000000000001";
const CANDIDATE_ID = "00000000-0000-4000-8000-000000000002";

describe("fit route contract", () => {
  it("builds every canonical workflow surface", () => {
    expect(fitWorkflowPath(WORKFLOW_ID)).toBe(`/fit/jobs/${WORKFLOW_ID}`);
    expect(fitWorkflowPath(WORKFLOW_ID, "results")).toBe(
      `/fit/jobs/${WORKFLOW_ID}/results`,
    );
    expect(fitWorkflowPath(WORKFLOW_ID, "compare")).toBe(
      `/fit/jobs/${WORKFLOW_ID}/compare`,
    );
    expect(fitWorkflowPath(WORKFLOW_ID, "candidate-review", CANDIDATE_ID)).toBe(
      `/fit/jobs/${WORKFLOW_ID}/candidates/${CANDIDATE_ID}/review`,
    );
  });

  it("rejects malformed owner and candidate handles", () => {
    expect(isFitWorkflowId("../../admin")).toBe(false);
    expect(() => fitWorkflowPath("not-a-workflow")).toThrow(TypeError);
    expect(() => fitWorkflowPath(WORKFLOW_ID, "candidate-review", "bad")).toThrow(TypeError);
  });

  it("canonicalizes legacy job and new-space query parameters", () => {
    expect(resolveFitEntry({ job: WORKFLOW_ID })).toEqual({
      kind: "redirect",
      href: `/fit/jobs/${WORKFLOW_ID}`,
    });
    expect(resolveFitEntry({ new: "1" })).toEqual({
      kind: "redirect",
      href: "/fit/space",
    });
    expect(resolveAgentEntry({ job: [WORKFLOW_ID, "ignored"] })).toBe(
      `/fit/jobs/${WORKFLOW_ID}`,
    );
  });

  it("leaves demo, share-state, and malformed compatibility params to the fit entry", () => {
    expect(resolveFitEntry({})).toEqual({ kind: "render" });
    expect(resolveFitEntry({ job: "not-a-workflow" })).toEqual({ kind: "render" });
    expect(resolveAgentEntry({ job: "not-a-workflow" })).toBe("/fit");
  });
});
