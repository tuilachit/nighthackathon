import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface CatalogRecord {
  readonly id: string;
  readonly model?: {
    readonly glbPath: string;
  };
}

const CATALOG_PATH = resolve(process.cwd(), "public/catalog.json");
const GENERATOR_PATH = resolve(process.cwd(), "scripts/catalog/generate-meshy-heroes.ts");
const DEFAULT_DELAY_MS = 30_000;
const MINIMUM_DELAY_MS = 5_000;

async function main(): Promise<void> {
  const initialCatalog = await readCatalog();
  const pendingIds = initialCatalog.filter((product) => product.model === undefined).map((product) => product.id);
  const delayMs = getDelayMs();

  console.log(`${pendingIds.length} catalog products lack a cached model; resuming at ${delayMs} ms intervals.`);
  for (const [index, id] of pendingIds.entries()) {
    const current = (await readCatalog()).find((product) => product.id === id);
    if (current?.model !== undefined) {
      console.log(`${id}: already complete; skipped.`);
      continue;
    }

    const exitCode = await runGenerator(id);
    if (exitCode !== 0) {
      console.error(`${id}: generation failed with exit code ${exitCode}; leaving it resumable.`);
    }
    if (index < pendingIds.length - 1) {
      await delay(delayMs);
    }
  }
}

async function readCatalog(): Promise<readonly CatalogRecord[]> {
  const parsed = JSON.parse(await readFile(CATALOG_PATH, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("public/catalog.json must be an array.");
  }
  return parsed as readonly CatalogRecord[];
}

async function runGenerator(id: string): Promise<number> {
  return new Promise((resolveExit, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", GENERATOR_PATH, `--catalog-product=${id}`],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

function getDelayMs(): number {
  const configured = Number(process.env.MODEL_GENERATION_DELAY_MS ?? DEFAULT_DELAY_MS);
  if (!Number.isFinite(configured)) {
    return DEFAULT_DELAY_MS;
  }
  return Math.max(MINIMUM_DELAY_MS, Math.round(configured));
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, durationMs));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Catalog model generation failed.");
  process.exitCode = 1;
});
