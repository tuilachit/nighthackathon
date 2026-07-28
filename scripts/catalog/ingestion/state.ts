import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isRecord, stringValue } from "./shared";

interface ProcessedProduct {
  readonly status: "accepted" | "rejected";
  readonly productId?: string;
  readonly reason?: string;
  readonly processedAt: string;
}

interface PersistedIngestionState {
  readonly version: 1;
  readonly baselineProductIds: readonly string[];
  readonly processed: Readonly<Record<string, ProcessedProduct>>;
}

/** Persists product-page outcomes so interrupted ingestion runs are resumable. */
export class IngestionStateStore {
  private state: PersistedIngestionState = {
    version: 1,
    baselineProductIds: [],
    processed: {},
  };

  public constructor(private readonly path: string) {}

  public async load(): Promise<void> {
    try {
      const input = JSON.parse(await readFile(this.path, "utf8")) as unknown;
      this.state = parseState(input);
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
  }

  public hasProcessed(productUrl: string): boolean {
    return this.state.processed[productUrl] !== undefined;
  }

  public async initializeBaseline(productIds: readonly string[]): Promise<void> {
    if (this.state.baselineProductIds.length > 0) {
      return;
    }
    this.state = {
      ...this.state,
      baselineProductIds: [...new Set(productIds)],
    };
    await this.save();
  }

  public countProductsAddedSinceBaseline(
    productIds: readonly string[],
  ): number {
    const baseline = new Set(this.state.baselineProductIds);
    return productIds.filter((id) => !baseline.has(id)).length;
  }

  public async markAccepted(
    productUrl: string,
    productId: string,
  ): Promise<void> {
    await this.update(productUrl, {
      status: "accepted",
      productId,
      processedAt: new Date().toISOString(),
    });
  }

  public async markRejected(
    productUrl: string,
    reason: string,
  ): Promise<void> {
    await this.update(productUrl, {
      status: "rejected",
      reason: reason.slice(0, 300),
      processedAt: new Date().toISOString(),
    });
  }

  private async update(
    productUrl: string,
    result: ProcessedProduct,
  ): Promise<void> {
    this.state = {
      version: 1,
      baselineProductIds: this.state.baselineProductIds,
      processed: { ...this.state.processed, [productUrl]: result },
    };
    await this.save();
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(this.state, null, 2)}\n`,
      "utf8",
    );
    await rename(temporaryPath, this.path);
  }
}

function parseState(value: unknown): PersistedIngestionState {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.processed)) {
    throw new Error("The catalog ingestion state file is invalid.");
  }
  const processed: Record<string, ProcessedProduct> = {};
  const baselineProductIds = Array.isArray(value.baselineProductIds)
    ? value.baselineProductIds.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : [];
  for (const [url, entry] of Object.entries(value.processed)) {
    if (!isRecord(entry)) {
      continue;
    }
    const status =
      entry.status === "accepted" || entry.status === "rejected"
        ? entry.status
        : undefined;
    const processedAt = stringValue(entry.processedAt);
    if (status === undefined || processedAt === undefined) {
      continue;
    }
    processed[url] = {
      status,
      ...(stringValue(entry.productId) === undefined
        ? {}
        : { productId: stringValue(entry.productId) }),
      ...(stringValue(entry.reason) === undefined
        ? {}
        : { reason: stringValue(entry.reason) }),
      processedAt,
    };
  }
  return { version: 1, baselineProductIds, processed };
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
