import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { requireValidCatalog } from "../../lib/catalog-validation";

interface MeshyBalanceResponse {
  readonly balance?: unknown;
}

interface MeshyGenerationResult {
  readonly productId: string;
  readonly consumedCredits: number;
  readonly glbPath: string;
}

interface ChildResult {
  readonly exitCode: number;
  readonly generation?: MeshyGenerationResult;
}

interface BatchReport {
  readonly status: "running" | "complete" | "credit-exhausted";
  readonly initialBalance: number;
  readonly currentBalance: number;
  readonly creditsConsumed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly remainingWithoutAsset: number;
  readonly lastProductId?: string;
  readonly updatedAt: string;
}

const CATALOG_PATH = resolve(process.cwd(), "public/catalog.json");
const GENERATOR_PATH = resolve(
  process.cwd(),
  "scripts/catalog/generate-meshy-heroes.ts",
);
const REPORT_PATH = resolve(
  process.cwd(),
  ".cache/meshy-batch/last-report.json",
);
const MESHY_BALANCE_ENDPOINT =
  "https://api.meshy.ai/openapi/v1/balance";
const DEFAULT_DELAY_MS = 30_000;
const MINIMUM_DELAY_MS = 5_000;
const DEFAULT_MINIMUM_TASK_CREDITS = 30;
const RESULT_PREFIX = "MESHY_RESULT ";

async function main(): Promise<void> {
  const apiKey = requiredEnvironment("MESHY_API_KEY");
  if (process.env.ENABLE_MESHY !== "true") {
    throw new Error("ENABLE_MESHY must be true.");
  }

  const initialCatalog = await readCatalog();
  const pendingIds = initialCatalog
    .filter((product) => product.model === undefined)
    .map((product) => product.id);
  const delayMs = getDelayMs();
  const minimumTaskCredits = getMinimumTaskCredits();
  const initialBalance = await getBalance(apiKey);
  let currentBalance = initialBalance;
  let creditsConsumed = 0;
  let succeeded = 0;
  let failed = 0;

  console.log(
    `${pendingIds.length} catalog products lack a cached model; ` +
      `resuming at ${delayMs} ms intervals with ${initialBalance} credits.`,
  );

  for (const [index, id] of pendingIds.entries()) {
    const current = (await readCatalog()).find((product) => product.id === id);
    if (current?.model !== undefined) {
      console.log(`${id}: already complete; skipped.`);
      continue;
    }

    currentBalance = await getBalance(apiKey);
    if (currentBalance < minimumTaskCredits) {
      const report = await createReport(
        "credit-exhausted",
        initialBalance,
        currentBalance,
        creditsConsumed,
        succeeded,
        failed,
        id,
      );
      await writeReport(report);
      console.log(`MESHY_BATCH_REPORT ${JSON.stringify(report)}`);
      return;
    }

    const result = await runGenerator(id);
    if (result.exitCode === 2) {
      currentBalance = await getBalance(apiKey);
      const report = await createReport(
        "credit-exhausted",
        initialBalance,
        currentBalance,
        creditsConsumed,
        succeeded,
        failed,
        id,
      );
      await writeReport(report);
      console.log(`MESHY_BATCH_REPORT ${JSON.stringify(report)}`);
      return;
    }

    if (result.exitCode !== 0 || result.generation === undefined) {
      failed += 1;
      console.error(
        `${id}: generation failed with exit code ${result.exitCode}; ` +
          "leaving it resumable.",
      );
    } else {
      succeeded += 1;
      creditsConsumed += result.generation.consumedCredits;
    }

    currentBalance = await getBalance(apiKey);
    const report = await createReport(
      "running",
      initialBalance,
      currentBalance,
      creditsConsumed,
      succeeded,
      failed,
      id,
    );
    await writeReport(report);
    console.log(`MESHY_BATCH_REPORT ${JSON.stringify(report)}`);

    if (index < pendingIds.length - 1) {
      await delay(delayMs);
    }
  }

  const report = await createReport(
    "complete",
    initialBalance,
    currentBalance,
    creditsConsumed,
    succeeded,
    failed,
  );
  await writeReport(report);
  console.log(`MESHY_BATCH_REPORT ${JSON.stringify(report)}`);
}

async function readCatalog() {
  const parsed = JSON.parse(await readFile(CATALOG_PATH, "utf8")) as unknown;
  return requireValidCatalog(parsed);
}

async function runGenerator(id: string): Promise<ChildResult> {
  return new Promise((resolveExit, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", GENERATOR_PATH, `--catalog-product=${id}`],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      resolveExit({
        exitCode: code ?? 1,
        generation: parseGenerationResult(stdout),
      });
    });
  });
}

function parseGenerationResult(stdout: string): MeshyGenerationResult | undefined {
  const resultLine = stdout
    .split(/\r?\n/)
    .findLast((line) => line.startsWith(RESULT_PREFIX));
  if (resultLine === undefined) {
    return undefined;
  }
  const value = parseJson(resultLine.slice(RESULT_PREFIX.length));
  if (
    !isRecord(value) ||
    typeof value.productId !== "string" ||
    typeof value.consumedCredits !== "number" ||
    !Number.isFinite(value.consumedCredits) ||
    value.consumedCredits < 0 ||
    typeof value.glbPath !== "string"
  ) {
    return undefined;
  }
  return {
    productId: value.productId,
    consumedCredits: value.consumedCredits,
    glbPath: value.glbPath,
  };
}

async function getBalance(apiKey: string): Promise<number> {
  const response = await fetch(MESHY_BALANCE_ENDPOINT, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Meshy balance failed with HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as MeshyBalanceResponse;
  if (
    typeof payload.balance !== "number" ||
    !Number.isFinite(payload.balance) ||
    payload.balance < 0
  ) {
    throw new Error("Meshy balance returned an invalid credit value.");
  }
  return payload.balance;
}

async function createReport(
  status: BatchReport["status"],
  initialBalance: number,
  currentBalance: number,
  creditsConsumed: number,
  succeeded: number,
  failed: number,
  lastProductId?: string,
): Promise<BatchReport> {
  const remainingWithoutAsset = (await readCatalog()).filter(
    (product) => product.model === undefined,
  ).length;
  return {
    status,
    initialBalance,
    currentBalance,
    creditsConsumed,
    succeeded,
    failed,
    remainingWithoutAsset,
    ...(lastProductId === undefined ? {} : { lastProductId }),
    updatedAt: new Date().toISOString(),
  };
}

async function writeReport(report: BatchReport): Promise<void> {
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  const temporaryPath = `${REPORT_PATH}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, REPORT_PATH);
}

function getDelayMs(): number {
  const configured = Number(
    process.env.MODEL_GENERATION_DELAY_MS ?? DEFAULT_DELAY_MS,
  );
  if (!Number.isFinite(configured)) {
    return DEFAULT_DELAY_MS;
  }
  return Math.max(MINIMUM_DELAY_MS, Math.round(configured));
}

function getMinimumTaskCredits(): number {
  const configured = Number(
    process.env.MESHY_MINIMUM_TASK_CREDITS ??
      DEFAULT_MINIMUM_TASK_CREDITS,
  );
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_MINIMUM_TASK_CREDITS;
  }
  return Math.round(configured);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, durationMs);
  });
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Catalog model generation failed.",
  );
  process.exitCode = 1;
});
