import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  TablesInsert,
  TablesUpdate,
} from "../../lib/supabase/database.types";
import {
  discoverIkeaProducts,
  IKEA_CATEGORY_URLS,
  parseIkeaProduct,
} from "./ingestion/ikea";
import { ScrapingAntClient } from "./ingestion/scrapingant";
import {
  parseTargetListingResponse,
  targetDiscoveryUrls,
} from "./ingestion/target";
import type {
  ProductCandidate,
  ProductDiscoveryTarget,
  RetailerId,
  ScrapingRequestOptions,
} from "./ingestion/types";
import {
  discoverWayfairProducts,
  parseWayfairProduct,
  WAYFAIR_CATEGORY_URL,
} from "./ingestion/wayfair";

const DEFAULT_PRODUCTS_PER_RETAILER = 35;
const MINIMUM_PRODUCTS_PER_RETAILER = 34;
const DISCOVERY_SPARE_CANDIDATES = 5;
const FETCH_CONCURRENCY = 2;
const IMAGE_BUCKET = "product-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const RETAILER_LABELS: Readonly<Record<RetailerId, string>> = {
  ikea: "IKEA",
  target: "Target",
  wayfair: "Wayfair",
};

interface CollectionResult {
  readonly retailerId: RetailerId;
  readonly candidates: readonly ProductCandidate[];
  readonly seen: number;
  readonly rejected: number;
}

interface CachedProduct {
  readonly candidate: ProductCandidate;
  readonly productId: string;
  readonly image: TablesInsert<"product_images">;
}

interface CachedImage {
  readonly bytes: Uint8Array;
  readonly mimeType: AllowedImageMimeType;
  readonly sha256: string;
  readonly extension: string;
}

type AllowedImageMimeType =
  | "image/avif"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

const dryRun = process.argv.includes("--dry-run");
const productQuota = readProductQuota();

void main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const scrapingAntKey = requireEnvironment("SCRAPINGANT_API_KEY");
  const scrapingAnt = new ScrapingAntClient(scrapingAntKey);

  console.log(
    `Catalog sync starting (${productQuota} products per retailer${dryRun ? ", dry run" : ""}).`,
  );

  const results = await Promise.all([
    collectIkea(scrapingAnt),
    collectTarget(scrapingAnt),
    collectWayfair(scrapingAnt),
  ]);

  assertPublishableCoverage(results);
  printCollectionSummary(results);

  if (dryRun) {
    console.log("Dry run complete. Supabase and image storage were not changed.");
    return;
  }

  const supabase = createSecretClient();
  const runId = await startSyncRun(supabase);

  try {
    let accepted = 0;
    let imageRejected = 0;
    for (const result of results) {
      const cached = await cacheImages(
        supabase,
        result.candidates,
      );
      imageRejected += result.candidates.length - cached.length;
      if (cached.length < productQuota) {
        throw new Error(
          `${RETAILER_LABELS[result.retailerId]} produced only ${cached.length}/${productQuota} cacheable products.`,
        );
      }
      await publishRetailer(supabase, runId, result.retailerId, cached);
      accepted += cached.length;
      console.log(
        `${RETAILER_LABELS[result.retailerId]} published ${cached.length} verified products.`,
      );
    }

    const seen = results.reduce((sum, result) => sum + result.seen, 0);
    const parserRejected = results.reduce(
      (sum, result) => sum + result.rejected,
      0,
    );
    await finishSyncRun(supabase, runId, {
      status: "completed",
      products_seen: seen,
      products_accepted: accepted,
      products_rejected: parserRejected + imageRejected,
      notes: `Published ${accepted} products across ${results.length} retailers.`,
    });
    console.log(`Catalog sync complete: ${accepted} products are live.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishSyncRun(supabase, runId, {
      status: "failed",
      products_seen: results.reduce((sum, result) => sum + result.seen, 0),
      products_accepted: 0,
      products_rejected: results.reduce(
        (sum, result) => sum + result.rejected,
        0,
      ),
      notes: message.slice(0, 1_000),
    });
    throw error;
  }
}

async function collectIkea(
  scrapingAnt: ScrapingAntClient,
): Promise<CollectionResult> {
  const categoryPages = await Promise.all(
    IKEA_CATEGORY_URLS.map((url) => scrapingAnt.fetchText(url)),
  );
  const targets = deduplicateTargets(
    categoryPages.flatMap(discoverIkeaProducts),
  );
  return collectProductPages(
    "ikea",
    targets,
    scrapingAnt,
    (html) => parseIkeaProduct(html),
  );
}

async function collectTarget(
  scrapingAnt: ScrapingAntClient,
): Promise<CollectionResult> {
  const pages = await Promise.all(
    targetDiscoveryUrls().map((url) =>
      scrapingAnt.fetchText(url, { useResidentialProxy: true }),
    ),
  );
  const candidates = deduplicateCandidates(
    pages.flatMap((page) => {
      try {
        return parseTargetListingResponse(JSON.parse(page) as unknown);
      } catch {
        return [];
      }
    }),
  );

  return {
    retailerId: "target",
    candidates,
    seen: pages.length * 28,
    rejected: Math.max(0, pages.length * 28 - candidates.length),
  };
}

async function collectWayfair(
  scrapingAnt: ScrapingAntClient,
): Promise<CollectionResult> {
  const categoryPage = await scrapingAnt.fetchText(WAYFAIR_CATEGORY_URL, {
    renderJs: true,
    useResidentialProxy: true,
    waitForSelector: "[data-test-id='CardWrapper']",
  });
  const targets = deduplicateTargets(discoverWayfairProducts(categoryPage));
  return collectProductPages(
    "wayfair",
    targets,
    scrapingAnt,
    (html, target) => parseWayfairProduct(html, target.productUrl),
    { useResidentialProxy: true },
  );
}

async function collectProductPages(
  retailerId: RetailerId,
  targets: readonly ProductDiscoveryTarget[],
  scrapingAnt: ScrapingAntClient,
  parser: (
    html: string,
    target: ProductDiscoveryTarget,
  ) => ProductCandidate | undefined,
  options: ScrapingRequestOptions = {},
): Promise<CollectionResult> {
  const accepted: ProductCandidate[] = [];
  let seen = 0;
  let rejected = 0;

  for (
    let offset = 0;
    offset < targets.length &&
    accepted.length < productQuota + DISCOVERY_SPARE_CANDIDATES;
    offset += FETCH_CONCURRENCY
  ) {
    const batch = targets.slice(offset, offset + FETCH_CONCURRENCY);
    const parsed = await Promise.all(
      batch.map(async (target) => {
        try {
          const html = await scrapingAnt.fetchText(target.productUrl, options);
          return parser(html, target);
        } catch (error) {
          console.warn(
            `${RETAILER_LABELS[retailerId]} skipped ${target.externalId}: ${errorMessage(error)}`,
          );
          return undefined;
        }
      }),
    );
    seen += batch.length;
    for (const candidate of parsed) {
      if (candidate === undefined) {
        rejected += 1;
      } else if (
        !accepted.some(
          (existing) => existing.externalId === candidate.externalId,
        )
      ) {
        accepted.push(candidate);
      }
    }
    console.log(
      `${RETAILER_LABELS[retailerId]} progress: ${accepted.length} valid products.`,
    );
  }

  return {
    retailerId,
    candidates: accepted,
    seen,
    rejected,
  };
}

function assertPublishableCoverage(
  results: readonly CollectionResult[],
): void {
  const missing = results.filter(
    (result) => result.candidates.length < productQuota,
  );
  if (missing.length === 0) {
    return;
  }

  throw new Error(
    `Catalog was not published because coverage was incomplete: ${missing
      .map(
        (result) =>
          `${RETAILER_LABELS[result.retailerId]} ${result.candidates.length}/${productQuota}`,
      )
      .join(", ")}.`,
  );
}

function printCollectionSummary(results: readonly CollectionResult[]): void {
  for (const result of results) {
    console.log(
      `${RETAILER_LABELS[result.retailerId]}: ${result.candidates.length} valid, ${result.rejected} rejected, ${result.seen} inspected.`,
    );
  }
}

async function cacheImages(
  supabase: SupabaseClient<Database>,
  candidates: readonly ProductCandidate[],
): Promise<readonly CachedProduct[]> {
  const cached: CachedProduct[] = [];
  for (
    let offset = 0;
    offset < candidates.length;
    offset += FETCH_CONCURRENCY
  ) {
    const batch = candidates.slice(offset, offset + FETCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (candidate): Promise<CachedProduct | undefined> => {
        try {
          const productId = stableProductId(candidate);
          const source = await fetchImage(candidate.imageSourceUrl);
          const storagePath = [
            candidate.retailerId,
            sanitizePathSegment(candidate.externalId),
            `${source.sha256.slice(0, 20)}.${source.extension}`,
          ].join("/");
          const { error: uploadError } = await supabase.storage
            .from(IMAGE_BUCKET)
            .upload(storagePath, source.bytes, {
              cacheControl: "31536000",
              contentType: source.mimeType,
              upsert: true,
            });
          if (uploadError !== null) {
            throw uploadError;
          }
          const { data: publicUrl } = supabase.storage
            .from(IMAGE_BUCKET)
            .getPublicUrl(storagePath);
          return {
            candidate,
            productId,
            image: {
              product_id: productId,
              source_url: candidate.imageSourceUrl,
              storage_path: storagePath,
              public_url: publicUrl.publicUrl,
              attribution: `${RETAILER_LABELS[candidate.retailerId]} product photo`,
              alt_text: candidate.imageAltText,
              mime_type: source.mimeType,
              sha256: source.sha256,
              is_primary: true,
              fetched_at: new Date().toISOString(),
            },
          };
        } catch (error) {
          console.warn(
            `${RETAILER_LABELS[candidate.retailerId]} image skipped for ${candidate.externalId}: ${errorMessage(error)}`,
          );
          return undefined;
        }
      }),
    );
    cached.push(
      ...results.filter(
        (result): result is CachedProduct => result !== undefined,
      ),
    );
  }
  return cached;
}

async function fetchImage(sourceUrl: string): Promise<CachedImage> {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/png,image/jpeg",
      "User-Agent":
        "NightHackCatalogBot/1.0 (+product image cache; source retained)",
    },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Image source returned HTTP ${response.status}.`);
  }

  const declaredSize = Number.parseInt(
    response.headers.get("content-length") ?? "",
    10,
  );
  if (Number.isFinite(declaredSize) && declaredSize > MAX_IMAGE_BYTES) {
    throw new Error("Image exceeds the 5 MB storage limit.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image is empty or exceeds the 5 MB storage limit.");
  }
  const mimeType =
    allowedImageMimeType(response.headers.get("content-type")) ??
    sniffImageMimeType(bytes);
  if (mimeType === undefined) {
    throw new Error(
      `Unsupported image type: ${response.headers.get("content-type") ?? "missing"}.`,
    );
  }

  return {
    bytes,
    mimeType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    extension: extensionForMimeType(mimeType),
  };
}

async function publishRetailer(
  supabase: SupabaseClient<Database>,
  runId: string,
  retailerId: RetailerId,
  cached: readonly CachedProduct[],
): Promise<void> {
  const now = new Date().toISOString();
  const productRows: TablesInsert<"products">[] = cached.map(
    ({ candidate, productId }) => ({
      id: productId,
      retailer_id: candidate.retailerId,
      external_id: candidate.externalId,
      name: candidate.name,
      category: candidate.category,
      variant_label: candidate.variantLabel ?? null,
      variant_options: candidate.variantOptions,
      price_usd: candidate.priceUsd,
      currency: "USD",
      width_mm: candidate.dimensions.widthMm,
      height_mm: candidate.dimensions.heightMm,
      depth_mm: candidate.dimensions.depthMm,
      materials: [...candidate.materials],
      colors: [...candidate.colors],
      styles: [...candidate.styles],
      keywords: [...candidate.keywords],
      product_url: candidate.productUrl,
      verification_source_url: candidate.verificationSourceUrl,
      verified_at: now,
      last_seen_at: now,
      is_active: true,
      last_sync_run_id: runId,
      source_payload: candidate.sourcePayload,
      updated_at: now,
    }),
  );
  const { error: productError } = await supabase
    .from("products")
    .upsert(productRows, { onConflict: "id" });
  throwIfSupabaseError(productError);

  const productIds = cached.map(({ productId }) => productId);
  const { error: demoteImageError } = await supabase
    .from("product_images")
    .update({ is_primary: false })
    .in("product_id", productIds);
  throwIfSupabaseError(demoteImageError);

  const { error: imageError } = await supabase
    .from("product_images")
    .upsert(
      cached.map(({ image }) => image),
      { onConflict: "storage_path" },
    );
  throwIfSupabaseError(imageError);

  const { error: deactivateError } = await supabase
    .from("products")
    .update({ is_active: false, updated_at: now })
    .eq("retailer_id", retailerId);
  throwIfSupabaseError(deactivateError);

  const { error: activateError } = await supabase
    .from("products")
    .update({ is_active: true, updated_at: now })
    .in("id", productIds);
  throwIfSupabaseError(activateError);

  await upsertKnownModels(supabase, cached);
}

async function upsertKnownModels(
  supabase: SupabaseClient<Database>,
  products: readonly CachedProduct[],
): Promise<void> {
  const modelRows = products.flatMap(({ candidate, productId }) => {
    const model = knownModel(candidate);
    return model === undefined
      ? []
      : [
          {
            product_id: productId,
            glb_path: model.glbPath,
            usdz_path: model.usdzPath ?? null,
            native_width_mm: candidate.dimensions.widthMm,
            native_height_mm: candidate.dimensions.heightMm,
            native_depth_mm: candidate.dimensions.depthMm,
            scale_verified: true,
            updated_at: new Date().toISOString(),
          } satisfies TablesInsert<"product_models">,
        ];
  });
  if (modelRows.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("product_models")
    .upsert(modelRows, { onConflict: "product_id" });
  throwIfSupabaseError(error);
}

function knownModel(
  candidate: ProductCandidate,
):
  | {
      readonly glbPath: string;
      readonly usdzPath?: string;
    }
  | undefined {
  const key = `${candidate.retailerId}:${candidate.externalId.toLowerCase()}`;
  const models: Readonly<
    Record<
      string,
      {
        readonly glbPath: string;
        readonly usdzPath?: string;
        readonly dimensions: {
          readonly widthMm: number;
          readonly heightMm: number;
          readonly depthMm: number;
        };
      }
    >
  > = {
    "ikea:40178591": {
      glbPath: "/models/glb/ikea-laiva.glb",
      usdzPath: "/models/usdz/ikea-laiva.usdz",
      dimensions: { widthMm: 619, heightMm: 1651, depthMm: 241 },
    },
    "ikea:20436713": {
      glbPath: "/models/glb/ikea-baggebo-tall.glb",
      dimensions: { widthMm: 499, heightMm: 1600, depthMm: 251 },
    },
    "target:54376270": {
      glbPath: "/models/glb/target-dorm-3-white.glb",
      usdzPath: "/models/usdz/target-dorm-3-white.usdz",
      dimensions: { widthMm: 622, heightMm: 914, depthMm: 240 },
    },
    "wayfair:w112706923": {
      glbPath: "/models/glb/wayfair-ebern-oak.glb",
      usdzPath: "/models/usdz/wayfair-ebern-oak.usdz",
      dimensions: { widthMm: 610, heightMm: 1753, depthMm: 231 },
    },
  };
  const model = models[key];
  if (
    model === undefined ||
    model.dimensions.widthMm !== candidate.dimensions.widthMm ||
    model.dimensions.heightMm !== candidate.dimensions.heightMm ||
    model.dimensions.depthMm !== candidate.dimensions.depthMm
  ) {
    return undefined;
  }
  return {
    glbPath: model.glbPath,
    ...(model.usdzPath === undefined ? {} : { usdzPath: model.usdzPath }),
  };
}

async function startSyncRun(
  supabase: SupabaseClient<Database>,
): Promise<string> {
  const { data, error } = await supabase
    .from("catalog_sync_runs")
    .insert({ status: "running", provider: "scrapingant" })
    .select("id")
    .single();
  throwIfSupabaseError(error);
  if (data === null) {
    throw new Error("Supabase did not return a sync run ID.");
  }
  return data.id;
}

async function finishSyncRun(
  supabase: SupabaseClient<Database>,
  runId: string,
  update: Pick<
    TablesUpdate<"catalog_sync_runs">,
    | "status"
    | "products_seen"
    | "products_accepted"
    | "products_rejected"
    | "notes"
  >,
): Promise<void> {
  const { error } = await supabase
    .from("catalog_sync_runs")
    .update({
      ...update,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
  throwIfSupabaseError(error);
}

function createSecretClient(): SupabaseClient<Database> {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    requireEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = requireEnvironment("SUPABASE_SECRET_KEY");
  return createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function deduplicateTargets(
  targets: readonly ProductDiscoveryTarget[],
): readonly ProductDiscoveryTarget[] {
  return [
    ...new Map(
      targets.map((target) => [
        `${target.externalId}:${target.productUrl}`,
        target,
      ]),
    ).values(),
  ];
}

function deduplicateCandidates(
  candidates: readonly ProductCandidate[],
): readonly ProductCandidate[] {
  return [
    ...new Map(
      candidates.map((candidate) => [
        `${candidate.retailerId}:${candidate.externalId}`,
        candidate,
      ]),
    ).values(),
  ];
}

function stableProductId(candidate: ProductCandidate): string {
  return `${candidate.retailerId}-${sanitizePathSegment(candidate.externalId)}`;
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  if (sanitized.length === 0) {
    throw new Error("External product ID cannot form a stable path.");
  }
  return sanitized.slice(0, 100);
}

function allowedImageMimeType(
  contentType: string | null,
): AllowedImageMimeType | undefined {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  return normalized === "image/avif" ||
    normalized === "image/jpeg" ||
    normalized === "image/png" ||
    normalized === "image/webp"
    ? normalized
    : undefined;
}

function extensionForMimeType(mimeType: AllowedImageMimeType): string {
  switch (mimeType) {
    case "image/avif":
      return "avif";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}

function sniffImageMimeType(
  bytes: Uint8Array,
): AllowedImageMimeType | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  const ascii = new TextDecoder("ascii").decode(bytes.slice(0, 16));
  if (ascii.startsWith("RIFF") && ascii.includes("WEBP")) {
    return "image/webp";
  }
  if (ascii.includes("ftypavif") || ascii.includes("ftypavis")) {
    return "image/avif";
  }
  return undefined;
}

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function readProductQuota(): number {
  const configured = Number.parseInt(
    process.env.CATALOG_PRODUCTS_PER_RETAILER ?? "",
    10,
  );
  const value = Number.isInteger(configured)
    ? configured
    : DEFAULT_PRODUCTS_PER_RETAILER;
  if (value < MINIMUM_PRODUCTS_PER_RETAILER) {
    throw new Error(
      `CATALOG_PRODUCTS_PER_RETAILER must be at least ${MINIMUM_PRODUCTS_PER_RETAILER} so the live catalog has 100+ products.`,
    );
  }
  return value;
}

function throwIfSupabaseError(
  error: { readonly message: string } | null,
): void {
  if (error !== null) {
    throw new Error(error.message);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
