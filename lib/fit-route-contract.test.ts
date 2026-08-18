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
    expect(fitWorkflowPath(WORKFLOW_ID, "model")).toBe(
      `/fit/jobs/${WORKFLOW_ID}/model`,
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

  it("canonicalizes old demo flags to the dedicated tier results", () => {
    expect(resolveFitEntry({ demo: "1" })).toEqual({
      kind: "redirect",
      href: "/fit/demo/results?tier=fits",
    });
    expect(resolveFitEntry({ legacy: ["1", "ignored"] })).toEqual({
      kind: "redirect",
      href: "/fit/demo/results?tier=fits",
    });
  });

  it("redirects a valid legacy share without losing its measurement or choices", () => {
    expect(resolveFitEntry({
      w: "900",
      h: "1800",
      d: "350",
      a: "820",
      u: "25",
      source: "manual",
      q: "shelf",
      compare: "ikea-one,target-two",
    })).toEqual({
      kind: "redirect",
      href: "/fit/demo/results?tier=fits&w=900&h=1800&d=350&a=820&u=25&source=manual&q=shelf&compare=ikea-one%2Ctarget-two",
    });
  });

  it("leaves malformed compatibility parameters at the fit entry", () => {
    expect(resolveFitEntry({})).toEqual({ kind: "render" });
    expect(resolveFitEntry({ job: "not-a-workflow" })).toEqual({ kind: "render" });
    expect(resolveFitEntry({ w: "0", q: "shelf" })).toEqual({ kind: "render" });
    expect(resolveAgentEntry({ job: "not-a-workflow" })).toBe("/fit");
  });
});
