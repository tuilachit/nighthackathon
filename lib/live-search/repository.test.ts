import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc }),
}));

import {
  cancelWorkflowForOwner,
  createComparisonShare,
  createWorkflow,
  getWorkflowForOwner,
  listDueProviderTasks,
  resolveComparisonShare,
} from "./repository";

const WORKFLOW_ID = "11111111-1111-4111-8111-111111111111";
const TASK_ID = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_ID = "55555555-5555-4555-8555-555555555555";
const INPUT_HASH = "a".repeat(64);

describe("unified workflow repository contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("preserves prompt intent and cache policy when creating a live miss", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        workflow_id: WORKFLOW_ID,
        workflow_state: "queued",
        reused: false,
        cache_hit: false,
        freshness: "live",
      }],
      error: null,
    });

    const result = await createWorkflow(
      "owner-1",
      "actor-hash",
      {
        intent: {
          kind: "prompt",
          text: "narrow oak shelf",
          retailers: ["ikea-au", "kmart-au"],
        },
        measurement: {
          widthMm: 900,
          heightMm: 1_800,
          depthMm: 350,
          accessWidthMm: 820,
          uncertaintyMm: 25,
          source: "manual",
        },
        cachePolicy: "prefer-recent",
      },
      INPUT_HASH,
      "idempotency-key-123456",
    );

    expect(result).toMatchObject({ cacheHit: false, freshness: "live" });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_search_workflow",
      expect.objectContaining({
        p_owner_id: "owner-1",
        p_intent_kind: "prompt",
        p_intent_json: {
          kind: "prompt",
          text: "narrow oak shelf",
          retailers: ["ikea-au", "kmart-au"],
        },
        p_retailers: ["ikea-au", "kmart-au"],
        p_cache_policy: "prefer-recent",
        p_cache_key: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
  });

  it("passes force-refresh for an exact product link and does not accept a cache hit", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        workflow_id: WORKFLOW_ID,
        workflow_state: "queued",
        reused: false,
        cache_hit: false,
        freshness: "live",
      }],
      error: null,
    });

    const result = await createWorkflow(
      "owner-1",
      "actor-hash",
      {
        intent: { kind: "product-link", url: "https://furniture.example/item/1" },
        measurement: {
          widthMm: 900,
          heightMm: 1_800,
          depthMm: 350,
          uncertaintyMm: 25,
          source: "manual",
        },
        cachePolicy: "force-refresh",
      },
      INPUT_HASH,
      "idempotency-key-123456",
    );

    expect(result.cacheHit).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_search_workflow",
      expect.objectContaining({
        p_intent_kind: "product-link",
        p_intent_json: {
          kind: "product-link",
          url: "https://furniture.example/item/1",
        },
        p_retailers: [],
        p_cache_policy: "force-refresh",
      }),
    );
  });

  it("passes owner identity into cancellation and returns one canonical provider id", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        workflowId: WORKFLOW_ID,
        state: "cancelled",
        alreadyTerminal: false,
        browserExternalId: "browser-session-1",
      },
      error: null,
    });

    await expect(cancelWorkflowForOwner("owner-1", WORKFLOW_ID)).resolves.toEqual({
      workflowId: WORKFLOW_ID,
      state: "cancelled",
      alreadyTerminal: false,
      browserExternalId: "browser-session-1",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("cancel_workflow", {
      p_owner_id: "owner-1",
      p_workflow_id: WORKFLOW_ID,
    });
  });

  it("stores and resolves comparison shares by opaque token hash", async () => {
    const tokenHash = "f".repeat(64);
    const payload = { workflowId: WORKFLOW_ID, candidateIds: [CANDIDATE_ID] };
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          shareId: TASK_ID,
          expiresAt: "2026-09-16T00:00:00.000Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          found: true,
          payload,
          schemaVersion: 1,
          expiresAt: "2026-09-16T00:00:00.000Z",
        },
        error: null,
      });

    await expect(createComparisonShare({
      ownerId: "owner-1",
      tokenHash,
      schemaVersion: 1,
      payload,
    })).resolves.toMatchObject({ shareId: TASK_ID });
    await expect(resolveComparisonShare(tokenHash)).resolves.toMatchObject({ payload });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "internal_create_comparison_share", {
      p_token_hash: tokenHash,
      p_schema_version: 1,
      p_payload: payload,
      p_owner_id: "owner-1",
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "internal_resolve_comparison_share", {
      p_token_hash: tokenHash,
    });
  });
});

describe("provider reconciliation repository contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("parses a mixed atomic lease batch containing poll, retry, and terminal dispositions", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          provider_task_id: TASK_ID,
          provider: "browser_use",
          stage: "retailer_search",
          external_task_id: "browser-session-1",
          workflow_id: WORKFLOW_ID,
          input_hash: INPUT_HASH,
          task_state: "submission_unknown",
          reconciliation_disposition: "poll_provider",
          attempts: 1,
          poll_count: 2,
          deadline_at: "2026-08-16T01:00:00.000Z",
        },
        {
          provider_task_id: "66666666-6666-4666-8666-666666666666",
          provider: "meshy",
          stage: "model_generation",
          external_task_id: null,
          workflow_id: "77777777-7777-4777-8777-777777777777",
          input_hash: "c".repeat(64),
          task_state: "retry_ready",
          reconciliation_disposition: "retry_submission",
          attempts: 2,
          poll_count: 0,
          deadline_at: "2026-08-16T01:05:00.000Z",
        },
        {
          provider_task_id: "33333333-3333-4333-8333-333333333333",
          provider: "meshy",
          stage: "model_generation",
          external_task_id: null,
          workflow_id: "44444444-4444-4444-8444-444444444444",
          input_hash: "b".repeat(64),
          task_state: "failed",
          reconciliation_disposition: "fail_ambiguous_submission",
          attempts: 1,
          poll_count: 0,
          deadline_at: "2026-08-16T01:10:00.000Z",
        },
        {
          provider_task_id: "88888888-8888-4888-8888-888888888888",
          provider: "browser_use",
          stage: "retailer_search",
          external_task_id: "browser-session-deadline",
          workflow_id: "99999999-9999-4999-8999-999999999999",
          input_hash: "d".repeat(64),
          task_state: "failed",
          reconciliation_disposition: "fail_provider_deadline",
          attempts: 1,
          poll_count: 3,
          deadline_at: "2026-08-16T01:15:00.000Z",
        },
      ],
      error: null,
    });

    await expect(listDueProviderTasks(5)).resolves.toEqual([
      expect.objectContaining({
        state: "submission_unknown",
        disposition: "poll_provider",
        externalTaskId: "browser-session-1",
        pollCount: 2,
      }),
      expect.objectContaining({
        state: "retry_ready",
        disposition: "retry_submission",
        attempts: 2,
      }),
      expect.objectContaining({
        state: "failed",
        disposition: "fail_ambiguous_submission",
        pollCount: 0,
      }),
      expect.objectContaining({
        state: "failed",
        disposition: "fail_provider_deadline",
        externalTaskId: "browser-session-deadline",
      }),
    ]);
  });

  it("rejects a poll disposition without a canonical external task id", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        provider_task_id: TASK_ID,
        provider: "browser_use",
        stage: "retailer_search",
        external_task_id: null,
        workflow_id: WORKFLOW_ID,
        input_hash: INPUT_HASH,
        task_state: "waiting_provider",
        reconciliation_disposition: "poll_provider",
        attempts: 1,
        poll_count: 1,
        deadline_at: "2026-08-16T01:00:00.000Z",
      }],
      error: null,
    });

    await expect(listDueProviderTasks(1)).rejects.toThrow(
      "Provider reconciliation RPC returned an invalid task.",
    );
  });

  it("rejects provider and stage combinations outside the durable contract", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{
        provider_task_id: TASK_ID,
        provider: "meshy",
        stage: "retailer_search",
        external_task_id: "meshy-task-1",
        workflow_id: WORKFLOW_ID,
        input_hash: INPUT_HASH,
        task_state: "waiting_provider",
        reconciliation_disposition: "poll_provider",
        attempts: 1,
        poll_count: 1,
        deadline_at: "2026-08-16T01:00:00.000Z",
      }],
      error: null,
    });

    await expect(listDueProviderTasks(1)).rejects.toThrow(
      "Provider reconciliation RPC returned an invalid task.",
    );
  });
});

describe("workflow snapshot repository contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fails closed when dimension provenance is missing", async () => {
    const snapshot = workflowSnapshot();
    delete snapshot.candidates[0].dimensions_source;
    mocks.rpc.mockResolvedValue({ data: [snapshot], error: null });

    await expect(getWorkflowForOwner(WORKFLOW_ID, TASK_ID)).rejects.toThrow(
      "Stored candidate provenance is invalid.",
    );
  });

  it("prefers a GLB when both GLB and USDZ assets exist for a candidate", async () => {
    const snapshot = workflowSnapshot();
    snapshot.assets = [
      assetRow("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "glb", "https://models.test/item.glb"),
      assetRow("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "usdz", "https://models.test/item.usdz"),
    ];
    mocks.rpc.mockResolvedValue({ data: [snapshot], error: null });

    const workflow = await getWorkflowForOwner(WORKFLOW_ID, TASK_ID);

    expect(workflow.candidates[0].asset).toMatchObject({
      kind: "glb",
      url: "https://models.test/item.glb",
    });
  });

  it("normalizes legacy retailer, package, and access rows additively", async () => {
    mocks.rpc.mockResolvedValue({ data: [workflowSnapshot()], error: null });

    const workflow = await getWorkflowForOwner(WORKFLOW_ID, TASK_ID);

    expect(workflow.intent).toEqual({
      kind: "prompt",
      text: "narrow oak bookcase",
      retailers: ["ikea-au", "kmart-au"],
    });
    expect(workflow.candidates[0].observation).toMatchObject({
      retailer: {
        key: "ikea-au",
        label: "IKEA Australia",
        host: "ikea.com",
      },
      packages: [],
    });
    expect(workflow.candidates[0].access).toEqual({
      status: "skipped",
      passes: true,
      basis: "unknown",
    });
  });

  it("parses generalized retailer identity, delivery packages, and package access basis", async () => {
    const snapshot = workflowSnapshot();
    snapshot.candidates[0].retailer_identity = {
      key: "example-furniture-au",
      label: "Example Furniture",
      host: "furniture.example",
    };
    snapshot.candidates[0].packages = [{
      widthMm: 900,
      heightMm: 850,
      depthMm: 300,
      label: "Box 2",
    }];
    snapshot.candidates[0].access_result = {
      status: "failed",
      passes: false,
      basis: "package",
      accessWidthMm: 820,
      crossSection: [
        { axis: "depth", sizeMm: 300 },
        { axis: "height", sizeMm: 850 },
      ],
      deficitMm: 95,
      reason: "Fits the space, but 95 mm too wide for the 820 mm access opening.",
      controllingPackageIndex: 0,
      controllingPackageLabel: "Box 2",
    };
    mocks.rpc.mockResolvedValue({ data: [snapshot], error: null });

    const workflow = await getWorkflowForOwner(WORKFLOW_ID, TASK_ID);

    expect(workflow.candidates[0].observation.retailer).toEqual({
      key: "example-furniture-au",
      label: "Example Furniture",
      host: "furniture.example",
    });
    expect(workflow.candidates[0].observation.packages).toEqual([{
      widthMm: 900,
      heightMm: 850,
      depthMm: 300,
      label: "Box 2",
    }]);
    expect(workflow.candidates[0].access).toMatchObject({
      status: "failed",
      basis: "package",
      controllingPackageIndex: 0,
      controllingPackageLabel: "Box 2",
    });
  });
});

function workflowSnapshot(): {
  workflow: Record<string, unknown>;
  candidates: Record<string, unknown>[];
  assets: Record<string, unknown>[];
} {
  return {
    workflow: {
      id: WORKFLOW_ID,
      state: "ready_for_approval",
      query_text: "narrow oak bookcase",
      width_mm: 900,
      height_mm: 1800,
      depth_mm: 350,
      access_width_mm: 820,
      uncertainty_mm: 25,
      measurement_source: "manual",
      retailers: ["ikea-au", "kmart-au"],
      is_partial: false,
      coverage_notes: [],
      created_at: "2026-08-16T00:00:00.000Z",
      updated_at: "2026-08-16T00:01:00.000Z",
    },
    candidates: [{
      id: CANDIDATE_ID,
      rank: 0,
      fit_status: "fits",
      retailer: "ikea-au",
      retailer_product_id: "item-1",
      name: "Narrow bookcase",
      category: "bookcase",
      product_url: "https://www.ikea.com/au/en/p/item-1",
      image_url: "https://www.ikea.com/images/item-1.jpg",
      price_minor: 12900,
      currency: "AUD",
      availability: "in_stock",
      width_mm: 600,
      height_mm: 1700,
      depth_mm: 280,
      dimensions_source: "retailer-page",
      dimensions_evidence: "Product page lists W 60 cm, H 170 cm, D 28 cm.",
      observed_at: "2026-08-16T00:00:00.000Z",
      fit_result: {
        fits: true,
        orientation: "default",
        widthClearanceMm: 235,
        heightClearanceMm: 65,
        depthClearanceMm: 5,
        minimumClearanceMm: 5,
        confidence: "high",
        reasons: [],
      },
      access_result: { status: "skipped", passes: true },
    }],
    assets: [],
  };
}

function assetRow(id: string, kind: "glb" | "usdz", publicUrl: string): Record<string, unknown> {
  return {
    id,
    candidate_id: CANDIDATE_ID,
    kind,
    public_url: publicUrl,
    scale_verified: true,
    width_mm: 600,
    height_mm: 1700,
    depth_mm: 280,
  };
}
