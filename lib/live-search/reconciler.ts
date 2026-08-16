import "server-only";

import {
  archiveDurableQueueMessage,
  deadLetterDurableQueueMessage,
  expireDueWorkflows,
  getWebhookForProcessing,
  listDueProviderTasks,
  readDurableQueue,
  touchProviderReconciliation,
  type DueProviderTask,
  type DurableQueueMessage,
  type DurableQueueName,
} from "./repository";
import { readMeshyWebhookTaskId } from "./providers/meshy";
import {
  dispatchModelWorkflow,
  dispatchSearchWorkflow,
  processBrowserUseWebhook,
  processMeshyWebhook,
  reconcileBrowserUseTask,
  reconcileMeshyTask,
} from "./service";
import { isUuid } from "./validation";

const MAX_QUEUE_READS = 5;

export interface ReconciliationReport {
  readonly queueMessagesCompleted: number;
  readonly queueMessagesDeferred: number;
  readonly queueMessagesDeadLettered: number;
  readonly providerTasksPolled: number;
  readonly providerTasksRetried: number;
  readonly providerTasksTerminated: number;
  readonly workflowsExpired: number;
}

/**
 * Recovers queue submissions and missed provider callbacks. Database leases
 * make concurrent invocations safe; failed messages stay invisible briefly and
 * are retried or dead-lettered after a bounded number of reads.
 */
export async function reconcileLiveSearch(nowMs = Date.now()): Promise<ReconciliationReport> {
  const workflowsExpired = await expireDueWorkflows(25);
  const providerFirst = Math.floor(nowMs / 60_000) % 2 === 0;
  let queueReport: QueueReport = { completed: 0, deferred: 0, deadLettered: 0 };
  let providerReport: ProviderReport = { worked: false, polled: 0, retried: 0, terminated: 0 };
  if (providerFirst) {
    providerReport = await reconcileOneDueProviderTask();
    if (!providerReport.worked) {
      queueReport = await drainOneQueueFairly(nowMs);
    }
  } else {
    queueReport = await drainOneQueueFairly(nowMs);
    if (!queueReportHasWork(queueReport)) {
      providerReport = await reconcileOneDueProviderTask();
    }
  }

  return {
    queueMessagesCompleted: queueReport.completed,
    queueMessagesDeferred: queueReport.deferred,
    queueMessagesDeadLettered: queueReport.deadLettered,
    providerTasksPolled: providerReport.polled,
    providerTasksRetried: providerReport.retried,
    providerTasksTerminated: providerReport.terminated,
    workflowsExpired,
  };
}

interface QueueReport {
  readonly completed: number;
  readonly deferred: number;
  readonly deadLettered: number;
}

interface ProviderReport {
  readonly worked: boolean;
  readonly polled: number;
  readonly retried: number;
  readonly terminated: number;
}

const QUEUE_HANDLERS = [
  ["retailer_search", dispatchSearchMessage],
  ["model_generation", dispatchModelMessage],
  ["webhook_processing", processWebhookMessage],
] as const satisfies readonly (readonly [DurableQueueName, (message: DurableQueueMessage) => Promise<void>])[];

async function drainOneQueueFairly(nowMs: number): Promise<QueueReport> {
  const offset = Math.floor(nowMs / 60_000) % QUEUE_HANDLERS.length;
  for (let index = 0; index < QUEUE_HANDLERS.length; index += 1) {
    const [queue, handler] = QUEUE_HANDLERS[(offset + index) % QUEUE_HANDLERS.length];
    const report = await drainQueue(queue, 1, handler);
    if (queueReportHasWork(report)) {
      return report;
    }
  }
  return { completed: 0, deferred: 0, deadLettered: 0 };
}

function queueReportHasWork(report: QueueReport): boolean {
  return report.completed + report.deferred + report.deadLettered > 0;
}

async function reconcileOneDueProviderTask(): Promise<ProviderReport> {
  const task = (await listDueProviderTasks(1))[0];
  if (task === undefined) {
    return { worked: false, polled: 0, retried: 0, terminated: 0 };
  }
  if (
    task.disposition === "fail_ambiguous_submission" ||
    task.disposition === "fail_provider_deadline"
  ) {
    return { worked: true, polled: 0, retried: 0, terminated: 1 };
  }
  try {
    if (task.disposition === "retry_submission") {
      await retryProviderSubmission(task);
      return { worked: true, polled: 0, retried: 1, terminated: 0 };
    }
    await reconcileProviderTask(task);
    return { worked: true, polled: 1, retried: 0, terminated: 0 };
  } catch (error) {
    console.error("Provider reconciliation failed", {
      provider: task.provider,
      workflowId: task.workflowId,
      disposition: task.disposition,
      error: safeErrorMessage(error),
    });
    return { worked: true, polled: 0, retried: 0, terminated: 0 };
  }
}

async function retryProviderSubmission(task: DueProviderTask): Promise<void> {
  if (task.provider === "browser_use" && task.stage === "retailer_search") {
    await dispatchSearchWorkflow(task.workflowId, task.inputHash);
    return;
  }
  if (task.provider === "meshy" && task.stage === "model_generation") {
    await dispatchModelWorkflow(task.workflowId, task.inputHash);
    return;
  }
  throw new Error("Provider retry stage does not match its provider.");
}

async function drainQueue(
  queue: DurableQueueName,
  quantity: number,
  handler: (message: DurableQueueMessage) => Promise<void>,
): Promise<QueueReport> {
  const messages = await readDurableQueue(queue, quantity);
  let completed = 0;
  let deferred = 0;
  let deadLettered = 0;
  for (const message of messages) {
    try {
      await handler(message);
      await archiveDurableQueueMessage(queue, message.messageId);
      completed += 1;
    } catch (error) {
      const reason = safeErrorMessage(error);
      if (message.readCount >= MAX_QUEUE_READS) {
        await deadLetterDurableQueueMessage(queue, message, reason);
        deadLettered += 1;
      } else {
        deferred += 1;
      }
      console.error("Durable queue message failed", {
        queue,
        messageId: message.messageId,
        readCount: message.readCount,
        deadLettered: message.readCount >= MAX_QUEUE_READS,
        error: reason,
      });
    }
  }
  return { completed, deferred, deadLettered };
}

async function dispatchSearchMessage(value: DurableQueueMessage): Promise<void> {
  const workflowId = requiredUuid(value.message.workflowId, "workflowId");
  const requestHash = requiredHash(value.message.requestHash, "requestHash");
  await dispatchSearchWorkflow(workflowId, requestHash);
}

async function dispatchModelMessage(value: DurableQueueMessage): Promise<void> {
  const workflowId = requiredUuid(value.message.workflowId, "workflowId");
  const requestHash = requiredHash(value.message.requestHash, "requestHash");
  await dispatchModelWorkflow(workflowId, requestHash);
}

async function processWebhookMessage(value: DurableQueueMessage): Promise<void> {
  const inboxId = requiredUuid(value.message.inboxId, "inboxId");
  const webhook = await getWebhookForProcessing(inboxId);
  if (webhook.processed) {
    return;
  }
  if (webhook.provider === "browser_use") {
    const sessionId = readBrowserWebhookSessionId(webhook.payload);
    if (sessionId === undefined) {
      throw new Error("Stored Browser Use webhook has no session id.");
    }
    await processBrowserUseWebhook(webhook.inboxId, sessionId);
    return;
  }
  const taskId = readMeshyWebhookTaskId(webhook.payload);
  if (taskId === undefined) {
    throw new Error("Stored Meshy webhook has no task id.");
  }
  await processMeshyWebhook(webhook.inboxId, taskId);
}

async function reconcileProviderTask(task: DueProviderTask): Promise<void> {
  if (task.disposition !== "poll_provider" || task.externalTaskId === undefined) {
    throw new Error("Only a leased provider task with a canonical id can be polled.");
  }

  const result = task.provider === "browser_use"
    ? await reconcileBrowserUseTask(task.externalTaskId)
    : await reconcileMeshyTask(task.externalTaskId);
  if (!result.complete) {
    await touchProviderReconciliation(task.providerTaskId, 60, result.providerStatus);
  }
}

function readBrowserWebhookSessionId(
  payload: Readonly<Record<string, unknown>>,
): string | undefined {
  const event = payload.payload;
  if (typeof event !== "object" || event === null || Array.isArray(event)) {
    return undefined;
  }
  const sessionId = (event as Record<string, unknown>).session_id;
  return typeof sessionId === "string" && sessionId.length > 0 && sessionId.length <= 200
    ? sessionId
    : undefined;
}

function requiredUuid(value: unknown, label: string): string {
  if (!isUuid(value)) {
    throw new Error(`Queue message ${label} must be a UUID.`);
  }
  return value;
}

function requiredHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`Queue message ${label} must be a SHA-256 hex digest.`);
  }
  return value;
}

function safeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown reconciliation error.").slice(0, 500);
}
