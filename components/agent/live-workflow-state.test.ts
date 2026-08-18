import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPersistedWorkflowId,
  forgetWorkflowSessionHandle,
  LINKED_CANDIDATE_SESSION_KEY,
  PENDING_SEARCH_SESSION_KEY,
  persistLinkedCandidateReference,
  persistWorkflowId,
  readLinkedCandidateReference,
  readPendingSearch,
  readPersistedWorkflowId,
  WORKFLOW_SESSION_KEY,
} from "./live-workflow-state";

const WORKFLOW_ID = "00000000-0000-4000-8000-000000000001";
const CANDIDATE_ID = "00000000-0000-4000-8000-000000000002";
const TARGET_WORKFLOW_ID = "00000000-0000-4000-8000-000000000003";

describe("live workflow browser state", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/fit/search");
    window.sessionStorage.clear();
  });

  it("canonicalizes a newly acknowledged workflow and restores it from the path", () => {
    persistWorkflowId(WORKFLOW_ID);

    expect(window.location.pathname).toBe(`/fit/jobs/${WORKFLOW_ID}`);
    expect(window.location.search).toBe("");
    expect(window.sessionStorage.getItem(WORKFLOW_SESSION_KEY)).toBe(WORKFLOW_ID);
    expect(readPersistedWorkflowId()).toBe(WORKFLOW_ID);
  });

  it("keeps the selected canonical workflow surface", () => {
    window.history.replaceState(null, "", `/fit/jobs/${WORKFLOW_ID}/compare`);
    persistWorkflowId(WORKFLOW_ID);

    expect(window.location.pathname).toBe(`/fit/jobs/${WORKFLOW_ID}/compare`);
  });

  it("restores legacy query handles and clears canonical job routes safely", () => {
    window.history.replaceState(null, "", `/fit?job=${WORKFLOW_ID}`);
    expect(readPersistedWorkflowId()).toBe(WORKFLOW_ID);

    persistWorkflowId(WORKFLOW_ID);
    clearPersistedWorkflowId();
    expect(window.location.pathname).toBe("/fit/search");
    expect(window.sessionStorage.getItem(WORKFLOW_SESSION_KEY)).toBeNull();
  });

  it("ignores a malformed legacy query and falls back to a valid stored workflow", () => {
    window.history.replaceState(null, "", "/fit/search?job=not-a-workflow&mode=link");
    window.sessionStorage.setItem(WORKFLOW_SESSION_KEY, WORKFLOW_ID);

    expect(readPersistedWorkflowId()).toBe(WORKFLOW_ID);
    expect(window.location.pathname).toBe("/fit/search");
    expect(window.location.search).toBe("?mode=link");
    expect(window.sessionStorage.getItem(WORKFLOW_SESSION_KEY)).toBe(WORKFLOW_ID);
  });

  it("forgets a settled session handle without changing its canonical result URL", () => {
    window.history.replaceState(null, "", `/fit/jobs/${WORKFLOW_ID}/results?tier=fits`);
    window.sessionStorage.setItem(WORKFLOW_SESSION_KEY, WORKFLOW_ID);

    forgetWorkflowSessionHandle();

    expect(window.location.pathname).toBe(`/fit/jobs/${WORKFLOW_ID}/results`);
    expect(window.location.search).toBe("?tier=fits");
    expect(window.sessionStorage.getItem(WORKFLOW_SESSION_KEY)).toBeNull();
  });

  it("rejects malformed pending submissions rather than replaying paid work", () => {
    window.sessionStorage.setItem(
      PENDING_SEARCH_SESSION_KEY,
      JSON.stringify({
        version: 1,
        state: "posting",
        idempotencyKey: "search-duplicate-request-key",
        request: {
          intent: { kind: "product-link", url: "http://localhost/private" },
          measurement: {
            widthMm: 900,
            heightMm: 1800,
            depthMm: 350,
            uncertaintyMm: 25,
            source: "manual",
          },
          cachePolicy: "prefer-recent",
        },
      }),
    );

    expect(readPendingSearch()).toBeUndefined();
    expect(window.sessionStorage.getItem(PENDING_SEARCH_SESSION_KEY)).toBeNull();
  });

  it("round-trips a linked candidate scoped to one alternatives workflow", () => {
    persistLinkedCandidateReference({
      workflowId: WORKFLOW_ID,
      candidateId: CANDIDATE_ID,
      measurementKey: "900:1800:350:820:25",
      targetWorkflowId: TARGET_WORKFLOW_ID,
    });

    expect(readLinkedCandidateReference()).toEqual({
      workflowId: WORKFLOW_ID,
      candidateId: CANDIDATE_ID,
      measurementKey: "900:1800:350:820:25",
      targetWorkflowId: TARGET_WORKFLOW_ID,
    });
  });

  it("rejects a malformed linked-candidate target workflow", () => {
    window.sessionStorage.setItem(
      LINKED_CANDIDATE_SESSION_KEY,
      JSON.stringify({
        workflowId: WORKFLOW_ID,
        candidateId: CANDIDATE_ID,
        measurementKey: "900:1800:350:820:25",
        targetWorkflowId: "not-a-workflow",
      }),
    );

    expect(readLinkedCandidateReference()).toBeUndefined();
    expect(window.sessionStorage.getItem(LINKED_CANDIDATE_SESSION_KEY)).toBeNull();
  });
});
