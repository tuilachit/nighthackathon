import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheRetailerImage: vi.fn(),
  claimModelDispatch: vi.fn(),
  claimSearchDispatch: vi.fn(),
  completeModelAsset: vi.fn(),
  createBrowserSearchSession: vi.fn(),
  createMeshyImageTask: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  download: vi.fn(),
  evaluateLiveProducts: vi.fn(),
  failWorkflowStage: vi.fn(),
  findProviderTask: vi.fn(),
  getBrowserSearchSession: vi.fn(),
  getMeshyTask: vi.fn(),
  getWorkflowCommand: vi.fn(),
  getPublicUrl: vi.fn(),
  markWebhookProcessed: vi.fn(),
  recordBrowserSubmission: vi.fn(),
  recordCachedSearchResults: vi.fn(),
  recordDiscoveryCache: vi.fn(),
  recordMeshySubmission: vi.fn(),
  recordSearchResults: vi.fn(),
  rescaleGlbToDimensions: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("./evaluate", () => ({
  evaluateLiveProducts: mocks.evaluateLiveProducts,
}));

vi.mock("./model-processing/glb", () => ({
  rescaleGlbToDimensions: mocks.rescaleGlbToDimensions,
}));

vi.mock("./image-cache", () => ({
  cacheRetailerImage: mocks.cacheRetailerImage,
}));

vi.mock("./repository", () => ({
  claimModelDispatch: mocks.claimModelDispatch,
  claimSearchDispatch: mocks.claimSearchDispatch,
  completeModelAsset: mocks.completeModelAsset,
  failWorkflowStage: mocks.failWorkflowStage,
  findProviderTask: mocks.findProviderTask,
  getWorkflowCommand: mocks.getWorkflowCommand,
  markWebhookProcessed: mocks.markWebhookProcessed,
  recordBrowserSubmission: mocks.recordBrowserSubmission,
  recordCachedSearchResults: mocks.recordCachedSearchResults,
  recordDiscoveryCache: mocks.recordDiscoveryCache,
  recordMeshySubmission: mocks.recordMeshySubmission,
  recordSearchResults: mocks.recordSearchResults,
}));

vi.mock("./providers/browser-use", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./providers/browser-use")>();
  return {
    ...actual,
    createBrowserSearchSession: mocks.createBrowserSearchSession,
    getBrowserSearchSession: mocks.getBrowserSearchSession,
  };
});

vi.mock("./providers/meshy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./providers/meshy")>();
  return {
    ...actual,
    createMeshyImageTask: mocks.createMeshyImageTask,
    getMeshyTask: mocks.getMeshyTask,
  };
});

import { ProviderRequestError } from "./providers/browser-use";
import {
  completeCachedSearchWorkflow,
  dispatchModelWorkflow,
  dispatchSearchWorkflow,
  reconcileBrowserUseTask,
  reconcileMeshyTask,
} from "./service";

const WORKFLOW_ID = "11111111-1111-4111-8111-111111111111";
const PROVIDER_TASK_ID = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_HASH = "a".repeat(64);
const BROWSER_SESSION_ID = "browser-session-1";
const MESHY_TASK_ID = "meshy-task-1";
const DIMENSIONS = { widthMm: 700, heightMm: 1_600, depthMm: 280 } as const;
const MEASUREMENT = {
  widthMm: 900,
  heightMm: 1_800,
  depthMm: 350,
  accessWidthMm: 820,
  uncertaintyMm: 25,
  source: "manual" as const,
};

function rawObservation(
  retailer: "ikea-au" | "kmart-au",
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const ikea = retailer === "ikea-au";
  return {
    retailer: ikea
      ? { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" }
      : { key: "kmart-au", label: "Kmart Australia", host: "kmart.com.au" },
    retailerProductId: ikea ? "ikea-001" : "kmart-001",
    name: ikea ? "BILLY bookcase" : "Oak-look bookcase",
    category: "bookcase",
    productUrl: ikea
      ? "https://www.ikea.com/au/en/p/billy-bookcase-ikea-001/"
      : "https://www.kmart.com.au/product/oak-look-bookcase-kmart-001/",
    imageUrl: ikea
      ? "https://www.ikea.com/images/billy.jpg"
      : "https://www.kmart.com.au/images/bookcase.png",
    priceMinor: ikea ? 12_900 : 8_900,
    currency: "AUD",
    availability: "in_stock",
    assembledDimensions: DIMENSIONS,
    packages: [],
    dimensionsSource: "retailer-page",
    dimensionsEvidence: "Width: 70 cm; Height: 160 cm; Depth: 28 cm",
    confidence: "high",
    ...overrides,
  };
}

const EVALUATED_CANDIDATES = [{
  observation: {
    ...rawObservation("ikea-au"),
    observedAt: "2026-08-16T00:00:00.000Z",
  },
  fitStatus: "fits" as const,
  fit: {
    fits: true,
    orientation: "default" as const,
    widthClearanceMm: 135,
    heightClearanceMm: 165,
    depthClearanceMm: 25,
    minimumClearanceMm: 25,
    confidence: "high" as const,
    reasons: [],
  },
  access: {
    status: "skipped" as const,
    passes: true as const,
    basis: "unknown" as const,
  },
  rank: 0,
  snapshotHash: "b".repeat(64),
}];

function browserContext() {
  return {
    providerTaskId: PROVIDER_TASK_ID,
    workflowId: WORKFLOW_ID,
    inputHash: REQUEST_HASH,
    workflowState: "searching",
  } as const;
}

function modelContext(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    providerTaskId: PROVIDER_TASK_ID,
    workflowId: WORKFLOW_ID,
    inputHash: REQUEST_HASH,
    workflowState: "generating",
    candidateId: CANDIDATE_ID,
    dimensions: DIMENSIONS,
    ...overrides,
  } as const;
}

function browserCommand(retailers: readonly ("ikea-au" | "kmart-au")[] = ["ikea-au", "kmart-au"]) {
  return {
    id: WORKFLOW_ID,
    queryText: "narrow oak bookcase",
    intent: {
      kind: "prompt" as const,
      text: "narrow oak bookcase",
      retailers,
    },
    measurement: MEASUREMENT,
    retailers,
    cachePolicy: "prefer-recent" as const,
    cacheKey: "c".repeat(64),
    requestHash: REQUEST_HASH,
  } as const;
}

function stoppedBrowserSession(
  output: unknown,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    id: BROWSER_SESSION_ID,
    status: "stopped",
    isTaskSuccessful: true,
    output,
    totalCostUsd: 0.12,
    stepCount: 7,
    ...overrides,
  } as const;
}

function successfulMeshyTask(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    id: MESHY_TASK_ID,
    status: "SUCCEEDED",
    progress: 100,
    consumedCredits: 5,
    modelUrls: { glb: "https://assets.meshy.ai/models/model.glb" },
    ...overrides,
  } as const;
}

describe("live-search service orchestration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test-project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    mocks.failWorkflowStage.mockResolvedValue(undefined);
    mocks.recordBrowserSubmission.mockResolvedValue(undefined);
    mocks.recordCachedSearchResults.mockResolvedValue(1);
    mocks.recordDiscoveryCache.mockResolvedValue(undefined);
    mocks.recordMeshySubmission.mockResolvedValue(undefined);
    mocks.recordSearchResults.mockResolvedValue(1);
    mocks.completeModelAsset.mockResolvedValue("44444444-4444-4444-8444-444444444444");
    mocks.markWebhookProcessed.mockResolvedValue(undefined);
    mocks.findProviderTask.mockImplementation(async (provider: string) =>
      provider === "browser_use" ? browserContext() : modelContext()
    );
    mocks.getWorkflowCommand.mockResolvedValue(browserCommand());
    mocks.evaluateLiveProducts.mockReturnValue(EVALUATED_CANDIDATES);
    mocks.cacheRetailerImage.mockImplementation(async (url: string) => ({
      publicUrl: `https://test-project.supabase.co/storage/v1/object/public/product-images-public/${"d".repeat(64)}.jpg`,
      sha256: "d".repeat(64),
      sourceUrl: url,
    }));
    mocks.upload.mockResolvedValue({ error: null });
    mocks.download.mockResolvedValue({ data: null, error: null });
    mocks.getPublicUrl.mockReturnValue({
      data: { publicUrl: "https://storage.example/models-public/glb/model.glb" },
    });
    mocks.storageFrom.mockReturnValue({
      upload: mocks.upload,
      download: mocks.download,
      getPublicUrl: mocks.getPublicUrl,
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      storage: { from: mocks.storageFrom },
    });
    mocks.rescaleGlbToDimensions.mockReturnValue(Buffer.from("scaled-glb"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("Browser Use reconciliation", () => {
    it("leaves a running canonical session incomplete without writing results", async () => {
      mocks.getBrowserSearchSession.mockResolvedValue({
        id: BROWSER_SESSION_ID,
        status: "running",
      });

      await expect(reconcileBrowserUseTask(BROWSER_SESSION_ID)).resolves.toEqual({
        complete: false,
        providerStatus: "running",
      });
      expect(mocks.getWorkflowCommand).not.toHaveBeenCalled();
      expect(mocks.recordSearchResults).not.toHaveBeenCalled();
      expect(mocks.failWorkflowStage).not.toHaveBeenCalled();
    });

    it("persists a successful complete result with provider cost metadata", async () => {
      const output = {
        products: [rawObservation("ikea-au"), rawObservation("kmart-au")],
        partial: false,
        notes: [],
      };
      mocks.getBrowserSearchSession.mockResolvedValue(stoppedBrowserSession(output));

      await expect(reconcileBrowserUseTask(BROWSER_SESSION_ID)).resolves.toEqual({
        complete: true,
        providerStatus: "stopped",
      });

      expect(mocks.evaluateLiveProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          products: expect.arrayContaining([
            expect.objectContaining({
              retailer: expect.objectContaining({ key: "ikea-au" }),
              confidence: "high",
            }),
            expect.objectContaining({
              retailer: expect.objectContaining({ key: "kmart-au" }),
              confidence: "high",
            }),
          ]),
          partial: false,
          notes: [],
        }),
        MEASUREMENT,
      );
      expect(mocks.recordSearchResults).toHaveBeenCalledWith(
        WORKFLOW_ID,
        BROWSER_SESSION_ID,
        EVALUATED_CANDIDATES,
        false,
        [],
        { totalCostUsd: 0.12, stepCount: 7, notes: [] },
      );
      expect(mocks.failWorkflowStage).not.toHaveBeenCalled();
      expect(mocks.recordDiscoveryCache).toHaveBeenCalledWith(
        "c".repeat(64),
        expect.any(Number),
        expect.objectContaining({ partial: false }),
      );
    });

    it("persists explicit partial coverage notes unchanged", async () => {
      const output = {
        products: [rawObservation("ikea-au"), rawObservation("kmart-au")],
        partial: true,
        notes: ["Kmart search stopped before the final category page."],
      };
      mocks.getBrowserSearchSession.mockResolvedValue(stoppedBrowserSession(output));

      await reconcileBrowserUseTask(BROWSER_SESSION_ID);

      expect(mocks.recordSearchResults).toHaveBeenCalledWith(
        WORKFLOW_ID,
        BROWSER_SESSION_ID,
        EVALUATED_CANDIDATES,
        true,
        ["Kmart search stopped before the final category page."],
        expect.objectContaining({
          notes: ["Kmart search stopped before the final category page."],
        }),
      );
    });

    it("marks the result partial and records a stable note when a requested retailer is missing", async () => {
      const output = {
        products: [rawObservation("ikea-au")],
        partial: false,
        notes: [],
      };
      mocks.getBrowserSearchSession.mockResolvedValue(stoppedBrowserSession(output));

      await reconcileBrowserUseTask(BROWSER_SESSION_ID);

      const expectedNotes = ["No validated results returned for: kmart-au."];
      expect(mocks.recordSearchResults).toHaveBeenCalledWith(
        WORKFLOW_ID,
        BROWSER_SESSION_ID,
        EVALUATED_CANDIDATES,
        true,
        expectedNotes,
        { totalCostUsd: 0.12, stepCount: 7, notes: expectedNotes },
      );
    });

    it("fails malformed provider output without persisting candidates", async () => {
      mocks.getBrowserSearchSession.mockResolvedValue(stoppedBrowserSession({ notes: [] }));

      await expect(reconcileBrowserUseTask(BROWSER_SESSION_ID)).resolves.toEqual({
        complete: true,
        providerStatus: "invalid_output",
      });
      expect(mocks.failWorkflowStage).toHaveBeenCalledWith({
        workflowId: WORKFLOW_ID,
        provider: "browser_use",
        externalTaskId: BROWSER_SESSION_ID,
        errorCode: "browser_invalid_output",
        errorMessage: "Browser Use output did not contain products.",
        retryable: false,
      });
      expect(mocks.recordSearchResults).not.toHaveBeenCalled();
    });

    it("fails a batch when zero observations pass the validation gate", async () => {
      const output = {
        products: [rawObservation("ikea-au", {
          assembledDimensions: { widthMm: 700, heightMm: 1_600 },
        })],
        partial: false,
        notes: [],
      };
      mocks.getBrowserSearchSession.mockResolvedValue(stoppedBrowserSession(output));

      await reconcileBrowserUseTask(BROWSER_SESSION_ID);

      expect(mocks.failWorkflowStage).toHaveBeenCalledWith(expect.objectContaining({
        workflowId: WORKFLOW_ID,
        provider: "browser_use",
        externalTaskId: BROWSER_SESSION_ID,
        errorCode: "browser_invalid_output",
        errorMessage: expect.stringContaining("No browser product passed the validation gate."),
        retryable: false,
      }));
      expect(mocks.evaluateLiveProducts).not.toHaveBeenCalled();
      expect(mocks.recordSearchResults).not.toHaveBeenCalled();
    });

    it("rejects an otherwise valid product from a retailer outside the command", async () => {
      mocks.getWorkflowCommand.mockResolvedValue(browserCommand(["ikea-au"]));
      mocks.getBrowserSearchSession.mockResolvedValue(stoppedBrowserSession({
        products: [rawObservation("ikea-au"), rawObservation("kmart-au")],
        partial: false,
        notes: [],
      }));

      await reconcileBrowserUseTask(BROWSER_SESSION_ID);

      expect(mocks.failWorkflowStage).toHaveBeenCalledWith(expect.objectContaining({
        errorCode: "browser_invalid_output",
        errorMessage: "Browser search returned unrequested retailer kmart-au.",
        retryable: false,
      }));
      expect(mocks.recordSearchResults).not.toHaveBeenCalled();
    });

    it("turns an unsuccessful terminal provider session into a non-retryable failure", async () => {
      mocks.getBrowserSearchSession.mockResolvedValue({
        id: BROWSER_SESSION_ID,
        status: "timed_out",
        isTaskSuccessful: false,
        lastStepSummary: "Retailer blocked the final page.",
      });

      await expect(reconcileBrowserUseTask(BROWSER_SESSION_ID)).resolves.toEqual({
        complete: true,
        providerStatus: "timed_out",
      });
      expect(mocks.failWorkflowStage).toHaveBeenCalledWith({
        workflowId: WORKFLOW_ID,
        provider: "browser_use",
        externalTaskId: BROWSER_SESSION_ID,
        errorCode: "browser_timed_out",
        errorMessage: "Retailer blocked the final page.",
        retryable: false,
      });
    });

    it("re-evaluates an exact cached observation against the current workflow measurement", async () => {
      const currentMeasurement = {
        ...MEASUREMENT,
        widthMm: 760,
        accessWidthMm: 710,
      };
      const observedAt = new Date().toISOString();
      const sourceImageHash = "d".repeat(64);
      const cachedImageUrl = `https://test-project.supabase.co/storage/v1/object/public/product-images-public/${sourceImageHash}.jpg`;
      const cachedOutput = {
        products: [
          rawObservation("ikea-au", { observedAt, cachedImageUrl, sourceImageHash }),
          rawObservation("kmart-au", { observedAt, cachedImageUrl, sourceImageHash }),
        ],
        partial: false,
        notes: [],
      };
      mocks.getWorkflowCommand.mockResolvedValue({
        ...browserCommand(),
        measurement: currentMeasurement,
      });

      await expect(
        completeCachedSearchWorkflow(WORKFLOW_ID, cachedOutput),
      ).resolves.toEqual({
        state: "ready_for_approval",
        checkedAt: observedAt,
      });

      expect(mocks.evaluateLiveProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          products: expect.arrayContaining([
            expect.objectContaining({ retailer: expect.objectContaining({ key: "ikea-au" }) }),
            expect.objectContaining({ retailer: expect.objectContaining({ key: "kmart-au" }) }),
          ]),
        }),
        currentMeasurement,
      );
      expect(mocks.recordCachedSearchResults).toHaveBeenCalledWith(
        WORKFLOW_ID,
        EVALUATED_CANDIDATES,
        false,
        [],
        {
          cacheKey: "c".repeat(64),
          extractionSchemaVersion: expect.any(Number),
        },
      );
      expect(mocks.createBrowserSearchSession).not.toHaveBeenCalled();
      expect(mocks.cacheRetailerImage).not.toHaveBeenCalled();
    });
  });

  describe("Meshy reconciliation", () => {
    it.each(["PENDING", "IN_PROGRESS"] as const)(
      "leaves a %s task incomplete without touching storage",
      async (status) => {
        mocks.getMeshyTask.mockResolvedValue({
          id: MESHY_TASK_ID,
          status,
          progress: status === "PENDING" ? 0 : 50,
          modelUrls: {},
        });

        await expect(reconcileMeshyTask(MESHY_TASK_ID)).resolves.toEqual({
          complete: false,
          providerStatus: status,
        });
        expect(mocks.rescaleGlbToDimensions).not.toHaveBeenCalled();
        expect(mocks.completeModelAsset).not.toHaveBeenCalled();
        expect(mocks.failWorkflowStage).not.toHaveBeenCalled();
      },
    );

    it.each(["FAILED", "CANCELED"] as const)(
      "records a terminal %s task as non-retryable",
      async (status) => {
        mocks.getMeshyTask.mockResolvedValue({
          id: MESHY_TASK_ID,
          status,
          progress: 45,
          modelUrls: {},
          errorMessage: "Provider could not construct the mesh.",
        });

        await expect(reconcileMeshyTask(MESHY_TASK_ID)).resolves.toEqual({
          complete: true,
          providerStatus: status,
        });
        expect(mocks.failWorkflowStage).toHaveBeenCalledWith({
          workflowId: WORKFLOW_ID,
          provider: "meshy",
          externalTaskId: MESHY_TASK_ID,
          errorCode: `meshy_${status.toLowerCase()}`,
          errorMessage: "Provider could not construct the mesh.",
          retryable: false,
        });
      },
    );

    it("rejects a successful provider response that omits the GLB", async () => {
      mocks.getMeshyTask.mockResolvedValue(successfulMeshyTask({ modelUrls: {} }));

      await expect(reconcileMeshyTask(MESHY_TASK_ID)).resolves.toEqual({
        complete: true,
        providerStatus: "INVALID_OUTPUT",
      });
      expect(mocks.failWorkflowStage).toHaveBeenCalledWith({
        workflowId: WORKFLOW_ID,
        provider: "meshy",
        externalTaskId: MESHY_TASK_ID,
        errorCode: "meshy_invalid_output",
        errorMessage: "Completed Meshy task omitted its GLB or approved product dimensions.",
        retryable: false,
      });
      expect(mocks.rescaleGlbToDimensions).not.toHaveBeenCalled();
      expect(mocks.storageFrom).not.toHaveBeenCalled();
    });

    it("fails closed when exact-dimension rescaling cannot verify the GLB", async () => {
      mocks.getMeshyTask.mockResolvedValue(successfulMeshyTask());
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(Buffer.from("source-glb"), {
        status: 200,
        headers: { "content-type": "model/gltf-binary" },
      })));
      mocks.rescaleGlbToDimensions.mockImplementation(() => {
        throw new Error("Scaled width differs from the catalog target.");
      });

      await expect(reconcileMeshyTask(MESHY_TASK_ID)).resolves.toEqual({
        complete: true,
        providerStatus: "INVALID_GEOMETRY",
      });
      expect(mocks.rescaleGlbToDimensions).toHaveBeenCalledWith(
        Buffer.from("source-glb"),
        DIMENSIONS,
        CANDIDATE_ID,
      );
      expect(mocks.failWorkflowStage).toHaveBeenCalledWith({
        workflowId: WORKFLOW_ID,
        provider: "meshy",
        externalTaskId: MESHY_TASK_ID,
        errorCode: "meshy_scale_verification_failed",
        errorMessage: "Scaled width differs from the catalog target.",
        retryable: false,
      });
      expect(mocks.storageFrom).not.toHaveBeenCalled();
      expect(mocks.completeModelAsset).not.toHaveBeenCalled();
    });

    it("publishes and completes a content-addressed, dimension-verified GLB", async () => {
      const source = Buffer.from("source-glb");
      const scaled = Buffer.from("scaled-glb");
      mocks.getMeshyTask.mockResolvedValue(successfulMeshyTask());
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(source, {
        status: 200,
        headers: {
          "content-type": "model/gltf-binary",
          "content-length": String(source.length),
        },
      })));
      mocks.rescaleGlbToDimensions.mockReturnValue(scaled);

      await expect(reconcileMeshyTask(MESHY_TASK_ID)).resolves.toEqual({
        complete: true,
        providerStatus: "SUCCEEDED",
      });

      expect(mocks.rescaleGlbToDimensions).toHaveBeenCalledWith(source, DIMENSIONS, CANDIDATE_ID);
      expect(mocks.storageFrom).toHaveBeenNthCalledWith(1, "models-public");
      expect(mocks.upload).toHaveBeenCalledWith(
        expect.stringMatching(/^glb\/[a-f0-9]{64}\.glb$/),
        scaled,
        {
          cacheControl: "31536000",
          contentType: "model/gltf-binary",
          upsert: false,
        },
      );
      expect(mocks.completeModelAsset).toHaveBeenCalledWith(expect.objectContaining({
        workflowId: WORKFLOW_ID,
        externalTaskId: MESHY_TASK_ID,
        candidateId: CANDIDATE_ID,
        kind: "glb",
        storageBucket: "models-public",
        storagePath: expect.stringMatching(/^glb\/[a-f0-9]{64}\.glb$/),
        publicUrl: "https://storage.example/models-public/glb/model.glb",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        byteSize: scaled.length,
        dimensions: DIMENSIONS,
        providerMetadata: expect.objectContaining({
          status: "SUCCEEDED",
          progress: 100,
          consumedCredits: 5,
          sourceGlbHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }));
      expect(mocks.failWorkflowStage).not.toHaveBeenCalled();
    });

    it("verifies the existing bytes before reusing a content-addressed model path", async () => {
      const source = Buffer.from("source-glb");
      const scaled = Buffer.from("scaled-glb");
      mocks.getMeshyTask.mockResolvedValue(successfulMeshyTask());
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(source, {
        status: 200,
        headers: { "content-type": "model/gltf-binary" },
      })));
      mocks.rescaleGlbToDimensions.mockReturnValue(scaled);
      mocks.upload.mockResolvedValue({
        error: { statusCode: "409", message: "The resource already exists" },
      });
      mocks.download.mockResolvedValue({
        data: { arrayBuffer: async () => Uint8Array.from(scaled).buffer },
        error: null,
      });

      await expect(reconcileMeshyTask(MESHY_TASK_ID)).resolves.toEqual({
        complete: true,
        providerStatus: "SUCCEEDED",
      });

      expect(mocks.download).toHaveBeenCalledWith(
        expect.stringMatching(/^glb\/[a-f0-9]{64}\.glb$/),
      );
      expect(mocks.completeModelAsset).toHaveBeenCalledOnce();
    });

    it("rejects a duplicate content path when the stored bytes do not match", async () => {
      const source = Buffer.from("source-glb");
      mocks.getMeshyTask.mockResolvedValue(successfulMeshyTask());
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(source, {
        status: 200,
        headers: { "content-type": "model/gltf-binary" },
      })));
      mocks.rescaleGlbToDimensions.mockReturnValue(Buffer.from("scaled-glb"));
      mocks.upload.mockResolvedValue({
        error: { statusCode: "409", message: "The resource already exists" },
      });
      mocks.download.mockResolvedValue({
        data: { arrayBuffer: async () => Uint8Array.from(Buffer.from("other-bytes")).buffer },
        error: null,
      });

      await expect(reconcileMeshyTask(MESHY_TASK_ID)).rejects.toThrow(
        "A duplicate model path contained different bytes.",
      );
      expect(mocks.completeModelAsset).not.toHaveBeenCalled();
    });
  });

  describe("paid-provider dispatch idempotency", () => {
    it("does not submit when an existing search dispatch claim already owns the command", async () => {
      mocks.claimSearchDispatch.mockResolvedValue({
        providerTaskId: PROVIDER_TASK_ID,
        shouldSubmit: false,
      });
      mocks.getWorkflowCommand.mockResolvedValue(browserCommand());

      await dispatchSearchWorkflow(WORKFLOW_ID, REQUEST_HASH);

      expect(mocks.createBrowserSearchSession).not.toHaveBeenCalled();
      expect(mocks.recordBrowserSubmission).not.toHaveBeenCalled();
      expect(mocks.failWorkflowStage).not.toHaveBeenCalled();
    });

    it("preserves an exact product-link intent when submitting Browser Use", async () => {
      const intent = {
        kind: "product-link" as const,
        url: "https://furniture.example/products/oak-shelf",
      };
      mocks.claimSearchDispatch.mockResolvedValue({
        providerTaskId: PROVIDER_TASK_ID,
        shouldSubmit: true,
      });
      mocks.getWorkflowCommand.mockResolvedValue({
        ...browserCommand([]),
        queryText: intent.url,
        intent,
        retailers: [],
      });
      mocks.createBrowserSearchSession.mockResolvedValue({
        id: BROWSER_SESSION_ID,
        status: "created",
      });

      await dispatchSearchWorkflow(WORKFLOW_ID, REQUEST_HASH);

      expect(mocks.createBrowserSearchSession).toHaveBeenCalledWith(intent, MEASUREMENT);
      expect(mocks.recordBrowserSubmission).toHaveBeenCalledOnce();
    });

    it("classifies an ambiguous Browser Use POST failure as non-retryable", async () => {
      mocks.claimSearchDispatch.mockResolvedValue({
        providerTaskId: PROVIDER_TASK_ID,
        shouldSubmit: true,
      });
      mocks.createBrowserSearchSession.mockRejectedValue(new ProviderRequestError(
        "browser-use",
        500,
        "gateway disconnected after forwarding the request",
      ));

      await expect(dispatchSearchWorkflow(WORKFLOW_ID, REQUEST_HASH)).rejects.toThrow(
        "browser-use returned HTTP 500",
      );
      expect(mocks.createBrowserSearchSession).toHaveBeenCalledTimes(1);
      expect(mocks.failWorkflowStage).toHaveBeenCalledWith(expect.objectContaining({
        workflowId: WORKFLOW_ID,
        provider: "browser_use",
        errorCode: "browser_use_http_500",
        retryable: false,
      }));
    });

    it("classifies only an explicit provider rate limit as retryable", async () => {
      mocks.claimSearchDispatch.mockResolvedValue({
        providerTaskId: PROVIDER_TASK_ID,
        shouldSubmit: true,
      });
      mocks.createBrowserSearchSession.mockRejectedValue(new ProviderRequestError(
        "browser-use",
        429,
        "rate limited before acceptance",
      ));

      await expect(dispatchSearchWorkflow(WORKFLOW_ID, REQUEST_HASH)).rejects.toThrow(
        "browser-use returned HTTP 429",
      );
      expect(mocks.failWorkflowStage).toHaveBeenCalledWith(expect.objectContaining({
        errorCode: "browser_use_http_429",
        retryable: true,
      }));
    });

    it("recovers an accepted-but-unpersisted provider id without another submission", async () => {
      mocks.claimSearchDispatch.mockResolvedValue({
        providerTaskId: PROVIDER_TASK_ID,
        shouldSubmit: true,
      });
      mocks.createBrowserSearchSession.mockResolvedValue({
        id: BROWSER_SESSION_ID,
        status: "created",
      });
      mocks.recordBrowserSubmission.mockRejectedValue(new Error("database connection reset"));

      await expect(dispatchSearchWorkflow(WORKFLOW_ID, REQUEST_HASH)).rejects.toThrow(
        "database connection reset",
      );
      expect(mocks.createBrowserSearchSession).toHaveBeenCalledTimes(1);
      expect(mocks.failWorkflowStage).toHaveBeenCalledWith({
        workflowId: WORKFLOW_ID,
        provider: "browser_use",
        externalTaskId: BROWSER_SESSION_ID,
        errorCode: "browser_use_dispatch_failed",
        errorMessage: "database connection reset",
        retryable: true,
      });
    });

    it("submits Meshy once and records its external task id", async () => {
      mocks.claimModelDispatch.mockResolvedValue({
        providerTaskId: PROVIDER_TASK_ID,
        shouldSubmit: true,
        candidateId: CANDIDATE_ID,
        imageUrl: "https://www.ikea.com/images/billy.jpg",
        dimensions: DIMENSIONS,
      });
      mocks.createMeshyImageTask.mockResolvedValue(MESHY_TASK_ID);

      await dispatchModelWorkflow(WORKFLOW_ID, REQUEST_HASH);

      expect(mocks.createMeshyImageTask).toHaveBeenCalledTimes(1);
      expect(mocks.createMeshyImageTask).toHaveBeenCalledWith(
        "https://www.ikea.com/images/billy.jpg",
      );
      expect(mocks.recordMeshySubmission).toHaveBeenCalledWith(
        WORKFLOW_ID,
        PROVIDER_TASK_ID,
        MESHY_TASK_ID,
      );
      expect(mocks.failWorkflowStage).not.toHaveBeenCalled();
    });
  });
});
