import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveDurableQueueMessage: vi.fn(),
  deadLetterDurableQueueMessage: vi.fn(),
  expireDueWorkflows: vi.fn(),
  getWebhookForProcessing: vi.fn(),
  listDueProviderTasks: vi.fn(),
  readDurableQueue: vi.fn(),
  touchProviderReconciliation: vi.fn(),
  readMeshyWebhookTaskId: vi.fn(),
  dispatchModelWorkflow: vi.fn(),
  dispatchSearchWorkflow: vi.fn(),
  processBrowserUseWebhook: vi.fn(),
  processMeshyWebhook: vi.fn(),
  reconcileBrowserUseTask: vi.fn(),
  reconcileMeshyTask: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("./repository", () => ({
  archiveDurableQueueMessage: mocks.archiveDurableQueueMessage,
  deadLetterDurableQueueMessage: mocks.deadLetterDurableQueueMessage,
  expireDueWorkflows: mocks.expireDueWorkflows,
  getWebhookForProcessing: mocks.getWebhookForProcessing,
  listDueProviderTasks: mocks.listDueProviderTasks,
  readDurableQueue: mocks.readDurableQueue,
  touchProviderReconciliation: mocks.touchProviderReconciliation,
}));

vi.mock("./providers/meshy", () => ({
  readMeshyWebhookTaskId: mocks.readMeshyWebhookTaskId,
}));

vi.mock("./service", () => ({
  dispatchModelWorkflow: mocks.dispatchModelWorkflow,
  dispatchSearchWorkflow: mocks.dispatchSearchWorkflow,
  processBrowserUseWebhook: mocks.processBrowserUseWebhook,
  processMeshyWebhook: mocks.processMeshyWebhook,
  reconcileBrowserUseTask: mocks.reconcileBrowserUseTask,
  reconcileMeshyTask: mocks.reconcileMeshyTask,
}));

import { reconcileLiveSearch } from "./reconciler";

const WORKFLOW_ID = "11111111-1111-4111-8111-111111111111";
const INBOX_ID = "22222222-2222-4222-8222-222222222222";
const PROVIDER_TASK_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_HASH = "a".repeat(64);

describe("reconcileLiveSearch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.readDurableQueue.mockResolvedValue([]);
    mocks.archiveDurableQueueMessage.mockResolvedValue(true);
    mocks.deadLetterDurableQueueMessage.mockResolvedValue(undefined);
    mocks.listDueProviderTasks.mockResolvedValue([]);
    mocks.expireDueWorkflows.mockResolvedValue(0);
    mocks.touchProviderReconciliation.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches and archives at most one paid queue item per invocation", async () => {
    mocks.readDurableQueue.mockImplementation(async (queue: string) => {
      if (queue === "retailer_search") {
        return [{
          messageId: 11,
          readCount: 1,
          message: { workflowId: WORKFLOW_ID, requestHash: REQUEST_HASH },
        }];
      }
      if (queue === "model_generation") {
        return [{
          messageId: 12,
          readCount: 1,
          message: { workflowId: WORKFLOW_ID, requestHash: REQUEST_HASH },
        }];
      }
      return [];
    });

    const report = await reconcileLiveSearch(0);

    expect(mocks.dispatchSearchWorkflow).toHaveBeenCalledWith(WORKFLOW_ID, REQUEST_HASH);
    expect(mocks.dispatchModelWorkflow).not.toHaveBeenCalled();
    expect(mocks.archiveDurableQueueMessage).toHaveBeenCalledWith("retailer_search", 11);
    expect(mocks.deadLetterDurableQueueMessage).not.toHaveBeenCalled();
    expect(report).toEqual({
      queueMessagesCompleted: 1,
      queueMessagesDeferred: 0,
      queueMessagesDeadLettered: 0,
      providerTasksPolled: 0,
      providerTasksRetried: 0,
      providerTasksTerminated: 0,
      workflowsExpired: 0,
    });
  });

  it("rotates queue priority each minute so model and webhook work cannot starve", async () => {
    mocks.readDurableQueue.mockImplementation(async (queue: string) =>
      queue === "model_generation"
        ? [{
            messageId: 12,
            readCount: 1,
            message: { workflowId: WORKFLOW_ID, requestHash: REQUEST_HASH },
          }]
        : []
    );

    const report = await reconcileLiveSearch(60_000);

    expect(mocks.dispatchModelWorkflow).toHaveBeenCalledWith(WORKFLOW_ID, REQUEST_HASH);
    expect(mocks.archiveDurableQueueMessage).toHaveBeenCalledWith("model_generation", 12);
    expect(report.queueMessagesCompleted).toBe(1);
  });

  it("dead-letters a poison queue message on its fifth read", async () => {
    const poisonMessage = {
      messageId: 21,
      readCount: 5,
      message: { workflowId: "not-a-uuid", requestHash: REQUEST_HASH },
    };
    mocks.readDurableQueue.mockImplementation(async (queue: string) =>
      queue === "retailer_search" ? [poisonMessage] : []
    );

    const report = await reconcileLiveSearch();

    expect(mocks.dispatchSearchWorkflow).not.toHaveBeenCalled();
    expect(mocks.archiveDurableQueueMessage).not.toHaveBeenCalled();
    expect(mocks.deadLetterDurableQueueMessage).toHaveBeenCalledWith(
      "retailer_search",
      poisonMessage,
      "Queue message workflowId must be a UUID.",
    );
    expect(report.queueMessagesDeadLettered).toBe(1);
    expect(report.queueMessagesDeferred).toBe(0);
  });

  it("archives a replayed webhook message without processing it again", async () => {
    mocks.readDurableQueue.mockImplementation(async (queue: string) =>
      queue === "webhook_processing"
        ? [{ messageId: 31, readCount: 2, message: { inboxId: INBOX_ID } }]
        : []
    );
    mocks.getWebhookForProcessing.mockResolvedValue({
      inboxId: INBOX_ID,
      provider: "browser_use",
      payload: { payload: { task_id: "browser-task-1", session_id: "browser-session-1" } },
      processed: true,
      attempts: 1,
    });

    const report = await reconcileLiveSearch();

    expect(mocks.processBrowserUseWebhook).not.toHaveBeenCalled();
    expect(mocks.processMeshyWebhook).not.toHaveBeenCalled();
    expect(mocks.archiveDurableQueueMessage).toHaveBeenCalledWith("webhook_processing", 31);
    expect(report.queueMessagesCompleted).toBe(1);
  });

  it("processes an unhandled Browser Use webhook before archiving its queue message", async () => {
    mocks.readDurableQueue.mockImplementation(async (queue: string) =>
      queue === "webhook_processing"
        ? [{ messageId: 32, readCount: 1, message: { inboxId: INBOX_ID } }]
        : []
    );
    mocks.getWebhookForProcessing.mockResolvedValue({
      inboxId: INBOX_ID,
      provider: "browser_use",
      payload: { payload: { task_id: "browser-task-2", session_id: "browser-session-2" } },
      processed: false,
      attempts: 0,
    });

    await reconcileLiveSearch();

    expect(mocks.processBrowserUseWebhook).toHaveBeenCalledWith(INBOX_ID, "browser-session-2");
    expect(mocks.archiveDurableQueueMessage).toHaveBeenCalledWith("webhook_processing", 32);
  });

  it("polls a due provider task and defers its next reconciliation when incomplete", async () => {
    mocks.listDueProviderTasks.mockResolvedValue([{
      providerTaskId: PROVIDER_TASK_ID,
      provider: "browser_use",
      stage: "retailer_search",
      externalTaskId: "browser-task-3",
      workflowId: WORKFLOW_ID,
      inputHash: REQUEST_HASH,
      state: "waiting_provider",
      disposition: "poll_provider",
      attempts: 2,
      pollCount: 1,
      deadlineAt: "2026-08-16T01:00:00.000Z",
    }]);
    mocks.reconcileBrowserUseTask.mockResolvedValue({
      complete: false,
      providerStatus: "running",
    });

    const report = await reconcileLiveSearch();

    expect(mocks.reconcileBrowserUseTask).toHaveBeenCalledWith("browser-task-3");
    expect(mocks.touchProviderReconciliation).toHaveBeenCalledWith(
      PROVIDER_TASK_ID,
      60,
      "running",
    );
    expect(report.providerTasksPolled).toBe(1);
  });

  it("reclaims an explicit rate-limit retry through the stage dispatcher", async () => {
    mocks.listDueProviderTasks.mockResolvedValue([{
      providerTaskId: PROVIDER_TASK_ID,
      provider: "browser_use",
      stage: "retailer_search",
      workflowId: WORKFLOW_ID,
      inputHash: REQUEST_HASH,
      state: "retry_ready",
      disposition: "retry_submission",
      attempts: 1,
      pollCount: 0,
      deadlineAt: "2026-08-16T01:00:00.000Z",
    }]);

    const report = await reconcileLiveSearch(0);

    expect(mocks.dispatchSearchWorkflow).toHaveBeenCalledWith(WORKFLOW_ID, REQUEST_HASH);
    expect(mocks.reconcileBrowserUseTask).not.toHaveBeenCalled();
    expect(mocks.readDurableQueue).not.toHaveBeenCalled();
    expect(report.providerTasksRetried).toBe(1);
    expect(report.providerTasksPolled).toBe(0);
  });

  it("alternates paid queue work and provider polling so neither can starve", async () => {
    mocks.readDurableQueue.mockImplementation(async (queue: string) =>
      queue === "model_generation"
        ? [{
            messageId: 41,
            readCount: 1,
            message: { workflowId: WORKFLOW_ID, requestHash: REQUEST_HASH },
          }]
        : []
    );
    mocks.listDueProviderTasks.mockResolvedValue([{
      providerTaskId: PROVIDER_TASK_ID,
      provider: "meshy",
      stage: "model_generation",
      externalTaskId: "meshy-task-1",
      workflowId: WORKFLOW_ID,
      inputHash: REQUEST_HASH,
      state: "waiting_provider",
      disposition: "poll_provider",
      attempts: 1,
      pollCount: 1,
      deadlineAt: "2026-08-16T01:00:00.000Z",
    }]);
    mocks.reconcileMeshyTask.mockResolvedValue({ complete: true, providerStatus: "SUCCEEDED" });

    const queueFirst = await reconcileLiveSearch(60_000);
    expect(queueFirst.queueMessagesCompleted).toBe(1);
    expect(queueFirst.providerTasksPolled).toBe(0);
    expect(mocks.dispatchModelWorkflow).toHaveBeenCalledOnce();
    expect(mocks.reconcileMeshyTask).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.expireDueWorkflows.mockResolvedValue(0);
    mocks.listDueProviderTasks.mockResolvedValue([{
      providerTaskId: PROVIDER_TASK_ID,
      provider: "meshy",
      stage: "model_generation",
      externalTaskId: "meshy-task-1",
      workflowId: WORKFLOW_ID,
      inputHash: REQUEST_HASH,
      state: "waiting_provider",
      disposition: "poll_provider",
      attempts: 1,
      pollCount: 1,
      deadlineAt: "2026-08-16T01:00:00.000Z",
    }]);
    mocks.reconcileMeshyTask.mockResolvedValue({ complete: true, providerStatus: "SUCCEEDED" });
    mocks.readDurableQueue.mockResolvedValue([{
      messageId: 42,
      readCount: 1,
      message: { workflowId: WORKFLOW_ID, requestHash: REQUEST_HASH },
    }]);

    const providerFirst = await reconcileLiveSearch(120_000);
    expect(providerFirst.providerTasksPolled).toBe(1);
    expect(providerFirst.queueMessagesCompleted).toBe(0);
    expect(mocks.reconcileMeshyTask).toHaveBeenCalledWith("meshy-task-1");
    expect(mocks.dispatchSearchWorkflow).not.toHaveBeenCalled();
    expect(mocks.dispatchModelWorkflow).not.toHaveBeenCalled();
    expect(mocks.readDurableQueue).not.toHaveBeenCalled();
  });

  it("reports a provider submission terminally failed by the atomic database lease", async () => {
    mocks.listDueProviderTasks.mockResolvedValue([{
      providerTaskId: PROVIDER_TASK_ID,
      provider: "meshy",
      stage: "model_generation",
      workflowId: WORKFLOW_ID,
      inputHash: REQUEST_HASH,
      state: "failed",
      disposition: "fail_ambiguous_submission",
      attempts: 1,
      pollCount: 0,
      deadlineAt: "2026-08-16T01:00:00.000Z",
    }]);

    const report = await reconcileLiveSearch();

    expect(mocks.dispatchModelWorkflow).not.toHaveBeenCalled();
    expect(mocks.reconcileMeshyTask).not.toHaveBeenCalled();
    expect(mocks.touchProviderReconciliation).not.toHaveBeenCalled();
    expect(report.providerTasksPolled).toBe(0);
    expect(report.providerTasksTerminated).toBe(1);
  });

  it("includes expired workflows in the reconciliation report", async () => {
    mocks.expireDueWorkflows.mockResolvedValue(7);

    const report = await reconcileLiveSearch();

    expect(mocks.expireDueWorkflows).toHaveBeenCalledWith(25);
    expect(report.workflowsExpired).toBe(7);
  });
});
