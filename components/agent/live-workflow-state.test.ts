import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPersistedWorkflowId,
  PENDING_SEARCH_SESSION_KEY,
  persistWorkflowId,
  readPendingSearch,
  readPersistedWorkflowId,
  WORKFLOW_SESSION_KEY,
} from "./live-workflow-state";

const WORKFLOW_ID = "00000000-0000-4000-8000-000000000001";

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
});
