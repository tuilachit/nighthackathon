import type { ProductDimensions, SpaceMeasurement } from "@/lib/catalog-types";
import {
  CACHE_POLICIES,
  LIVE_RETAILERS,
  LIVE_RETAILER_IDENTITIES,
  MAX_COVERAGE_NOTE_LENGTH,
  MAX_COVERAGE_NOTES,
  WORKFLOW_STATES,
  type BrowserSearchOutput,
  type CachePolicy,
  type CreateLiveSearchRequest,
  type DeliveryPackage,
  type LiveSearchIntent,
  type LiveProductObservation,
  type LiveRetailer,
  type RetailerIdentity,
  type WorkflowState,
} from "./types";

const MIN_MEASUREMENT_MM = 100;
const MAX_MEASUREMENT_MM = 10_000;
const MAX_QUERY_LENGTH = 500;
const MAX_PRODUCT_NAME_LENGTH = 240;
const MAX_EVIDENCE_LENGTH = 2_000;
const MAX_PRODUCTS_PER_RESPONSE = 50;
const MAX_PACKAGES_PER_PRODUCT = 50;
const ISO_4217_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));
const ALLOWED_RETAILER_HOSTS: Readonly<Record<LiveRetailer, readonly string[]>> = {
  "ikea-au": ["ikea.com", "ikea.com.au"],
  "kmart-au": ["kmart.com.au"],
};
const ALLOWED_RETAILER_IMAGE_HOSTS: Readonly<Record<LiveRetailer, readonly string[]>> = {
  "ikea-au": ["ikea.com", "ikea.com.au"],
  "kmart-au": ["kmart.com.au", "kmartau.mo.cloudinary.net"],
};

export interface ValidationResult<T> {
  readonly ok: boolean;
  readonly value?: T;
  readonly errors: readonly string[];
}

/** Validates the untrusted command received by the live-search API. */
export function validateCreateLiveSearchRequest(
  input: unknown,
): ValidationResult<CreateLiveSearchRequest> {
  if (!isRecord(input)) {
    return failure("Request body must be an object.");
  }

  const errors: string[] = [];
  const intent = parseLiveSearchIntent(input.intent, errors);
  const measurement = parseMeasurement(input.measurement, errors);
  const cachePolicy = parseCachePolicy(input.cachePolicy, errors);
  if (intent === undefined || measurement === undefined || cachePolicy === undefined) {
    return { ok: false, errors };
  }
  return { ok: true, value: { intent, measurement, cachePolicy }, errors: [] };
}

/** Validates Browser Use structured output before any product reaches fit evaluation. */
export interface ValidateObservationOptions {
  /**
   * How old an observation's observedAt may be. Defaults to 24h for the live
   * path, where a result must describe a current scrape. Catalog serving passes
   * a longer window because a stored snapshot's dimensions are durable; its
   * price and availability staleness are surfaced to the user separately.
   */
  readonly maxObservationAgeMs?: number;
}

const DEFAULT_MAX_OBSERVATION_AGE_MS = 24 * 60 * 60_000;

export function validateBrowserSearchOutput(
  input: unknown,
  options: ValidateObservationOptions = {},
): ValidationResult<BrowserSearchOutput> {
  const parsedInput = typeof input === "string" ? parseJson(input) : input;
  if (!isRecord(parsedInput)) {
    return failure("Browser output must be an object.");
  }
  if (!Array.isArray(parsedInput.products)) {
    return failure("Browser output products must be an array.");
  }
  if (parsedInput.products.length > MAX_PRODUCTS_PER_RESPONSE) {
    return failure(`Browser output may contain at most ${MAX_PRODUCTS_PER_RESPONSE} products.`);
  }

  const errors: string[] = [];
  const rejected: string[] = [];
  const products: LiveProductObservation[] = [];
  const seenProducts = new Set<string>();
  for (const [index, entry] of parsedInput.products.entries()) {
    const entryErrors: string[] = [];
    const product = parseObservation(entry, `products[${index}]`, entryErrors, options);
    if (product === undefined || entryErrors.length > 0) {
      rejected.push(...entryErrors);
      continue;
    }
    const key = `${product.retailer.key}:${product.retailerProductId}`;
    if (seenProducts.has(key)) {
      rejected.push(`Browser output contains duplicate product ${key}.`);
      continue;
    }
    seenProducts.add(key);
    products.push(product);
  }
  const partial = parsedInput.partial;
  const notes = readStringArray(
    parsedInput.notes,
    "notes",
    errors,
    MAX_COVERAGE_NOTES,
    MAX_COVERAGE_NOTE_LENGTH,
  );
  if (typeof partial !== "boolean") {
    errors.push("partial must be a boolean.");
  }
  if (errors.length > 0 || typeof partial !== "boolean" || notes === undefined) {
    return { ok: false, errors };
  }
  if (products.length === 0 && parsedInput.products.length > 0) {
    return {
      ok: false,
      errors: ["No browser product passed the validation gate.", ...rejected],
    };
  }
  return {
    ok: true,
    value: {
      products,
      partial: partial || rejected.length > 0,
      notes: [...notes, ...rejected.map((reason) => `Rejected: ${reason}`)]
        .slice(0, MAX_COVERAGE_NOTES),
    },
    errors: [],
  };
}

export function isWorkflowState(value: unknown): value is WorkflowState {
  return typeof value === "string" && WORKFLOW_STATES.includes(value as WorkflowState);
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function parseMeasurement(
  input: unknown,
  errors: string[],
): SpaceMeasurement | undefined {
  if (!isRecord(input)) {
    errors.push("measurement must be an object.");
    return undefined;
  }
  const widthMm = boundedInteger(input.widthMm, "measurement.widthMm", errors);
  const heightMm = boundedInteger(input.heightMm, "measurement.heightMm", errors);
  const depthMm = boundedInteger(input.depthMm, "measurement.depthMm", errors);
  const uncertaintyMm = boundedInteger(
    input.uncertaintyMm,
    "measurement.uncertaintyMm",
    errors,
    0,
    500,
  );
  const accessWidthMm =
    input.accessWidthMm === undefined || input.accessWidthMm === null
      ? undefined
      : boundedInteger(input.accessWidthMm, "measurement.accessWidthMm", errors);
  if (input.source !== "manual" && input.source !== "demo" && input.source !== "webxr") {
    errors.push("measurement.source must be manual, demo, or webxr.");
  }
  if (
    widthMm === undefined ||
    heightMm === undefined ||
    depthMm === undefined ||
    uncertaintyMm === undefined ||
    (input.accessWidthMm !== undefined && input.accessWidthMm !== null && accessWidthMm === undefined) ||
    (input.source !== "manual" && input.source !== "demo" && input.source !== "webxr")
  ) {
    return undefined;
  }
  return {
    widthMm,
    heightMm,
    depthMm,
    uncertaintyMm,
    ...(accessWidthMm === undefined ? {} : { accessWidthMm }),
    source: input.source,
  };
}

function parseLiveSearchIntent(
  input: unknown,
  errors: string[],
): LiveSearchIntent | undefined {
  if (!isRecord(input)) {
    errors.push("intent must be an object.");
    return undefined;
  }
  if (input.kind === "prompt") {
    const text = readTrimmedString(input.text, "intent.text", errors, MAX_QUERY_LENGTH);
    const retailers = parseRetailers(input.retailers, errors, "intent.retailers");
    return text === undefined || retailers === undefined
      ? undefined
      : { kind: "prompt", text, retailers };
  }
  if (input.kind === "product-link") {
    const url = readHttpsUrl(input.url, "intent.url", errors);
    return url === undefined ? undefined : { kind: "product-link", url };
  }
  errors.push("intent.kind must be prompt or product-link.");
  return undefined;
}

function parseCachePolicy(
  input: unknown,
  errors: string[],
): CachePolicy | undefined {
  if (typeof input !== "string" || !CACHE_POLICIES.includes(input as CachePolicy)) {
    errors.push("cachePolicy must be prefer-recent or force-refresh.");
    return undefined;
  }
  return input as CachePolicy;
}

function parseRetailers(
  input: unknown,
  errors: string[],
  path = "retailers",
): readonly LiveRetailer[] | undefined {
  if (!Array.isArray(input) || input.length === 0) {
    errors.push(`${path} must contain at least one retailer.`);
    return undefined;
  }
  const retailers = [...new Set(input)].flatMap((entry) => {
    if (typeof entry !== "string" || !LIVE_RETAILERS.includes(entry as LiveRetailer)) {
      errors.push(`Unsupported retailer: ${String(entry)}.`);
      return [];
    }
    return [entry as LiveRetailer];
  });
  return retailers.length === 0 ? undefined : retailers;
}

function parseRetailerIdentity(
  input: unknown,
  path: string,
  errors: string[],
): RetailerIdentity | undefined {
  if (typeof input === "string") {
    if (!LIVE_RETAILERS.includes(input as LiveRetailer)) {
      errors.push(`${path} legacy key is unsupported.`);
      return undefined;
    }
    return LIVE_RETAILER_IDENTITIES[input as LiveRetailer];
  }
  if (!isRecord(input)) {
    errors.push(`${path} must be a retailer identity object.`);
    return undefined;
  }
  const key = readTrimmedString(input.key, `${path}.key`, errors, 80);
  const label = readTrimmedString(input.label, `${path}.label`, errors, 120);
  const host = readRetailerHost(input.host, `${path}.host`, errors);
  if (key === undefined || label === undefined || host === undefined) {
    return undefined;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) {
    errors.push(`${path}.key must be a lowercase kebab-case identifier.`);
    return undefined;
  }
  if (LIVE_RETAILERS.includes(key as LiveRetailer)) {
    // The server owns the canonical identity for a registered retailer. A provider
    // that answers "www.ikea.com" or "IKEA" instead of the exact registered strings
    // is naming the right retailer imprecisely, not a different one, so normalize
    // instead of discarding the observation. This is not the security boundary:
    // productUrl and imageUrl are independently constrained to that retailer's
    // allowed hosts by readRetailerUrl and readRetailerImageUrl.
    return LIVE_RETAILER_IDENTITIES[key as LiveRetailer];
  }
  return { key, label, host };
}

function parseObservation(
  input: unknown,
  path: string,
  errors: string[],
  options: ValidateObservationOptions = {},
): LiveProductObservation | undefined {
  if (!isRecord(input)) {
    errors.push(`${path} must be an object.`);
    return undefined;
  }
  const retailer = parseRetailerIdentity(input.retailer, `${path}.retailer`, errors);
  const retailerProductId = readTrimmedString(input.retailerProductId, `${path}.retailerProductId`, errors, 120);
  const name = readTrimmedString(input.name, `${path}.name`, errors, MAX_PRODUCT_NAME_LENGTH);
  const category = readTrimmedString(input.category, `${path}.category`, errors, 100);
  const productUrl = retailer === undefined
    ? undefined
    : readRetailerUrl(input.productUrl, retailer, `${path}.productUrl`, errors);
  const imageUrl = retailer === undefined
    ? undefined
    : readRetailerImageUrl(input.imageUrl, retailer, `${path}.imageUrl`, errors);
  const priceMinor = boundedInteger(input.priceMinor, `${path}.priceMinor`, errors, 1, 100_000_000);
  const assembledDimensions = parseProductDimensions(input.assembledDimensions, `${path}.assembledDimensions`, errors);
  const packages = parseDeliveryPackages(
    input.packages,
    input.packageDimensions,
    path,
    errors,
  );
  const dimensionsEvidence = readTrimmedString(input.dimensionsEvidence, `${path}.dimensionsEvidence`, errors, MAX_EVIDENCE_LENGTH);
  const observedAt = readIsoDate(input.observedAt, `${path}.observedAt`, errors, options);
  const availability =
    input.availability === "in_stock" ||
    input.availability === "out_of_stock" ||
    input.availability === "unknown"
      ? input.availability
      : undefined;
  if (availability === undefined) {
    errors.push(`${path}.availability is invalid.`);
  }
  const dimensionsSource =
    input.dimensionsSource === "retailer-page" ||
    input.dimensionsSource === "retailer-api" ||
    input.dimensionsSource === "json-ld"
      ? input.dimensionsSource
      : undefined;
  if (dimensionsSource === undefined) {
    errors.push(`${path}.dimensionsSource is invalid.`);
  }
  const currency = readCurrency(input.currency, `${path}.currency`, errors);
  if (input.confidence !== "high") {
    errors.push(`${path}.confidence must be high.`);
  }
  if (
    assembledDimensions !== undefined &&
    dimensionsEvidence !== undefined &&
    !evidenceMatchesDimensions(dimensionsEvidence, assembledDimensions)
  ) {
    errors.push(`${path}.dimensionsEvidence must explicitly match Width/Height/Depth or W/H/D.`);
  }
  if (
    retailer === undefined ||
    retailerProductId === undefined ||
    name === undefined ||
    category === undefined ||
    productUrl === undefined ||
    imageUrl === undefined ||
    priceMinor === undefined ||
    assembledDimensions === undefined ||
    packages === undefined ||
    dimensionsEvidence === undefined ||
    observedAt === undefined ||
    availability === undefined ||
    dimensionsSource === undefined ||
    currency === undefined ||
    input.confidence !== "high"
  ) {
    return undefined;
  }
  return {
    retailer,
    retailerProductId,
    name,
    category,
    productUrl,
    imageUrl,
    priceMinor,
    currency,
    availability,
    assembledDimensions,
    packages: packages.values,
    dimensionsSource,
    dimensionsEvidence,
    observedAt,
    confidence: "high",
  };
}

interface ParsedDeliveryPackages {
  readonly values: readonly DeliveryPackage[];
}

function parseDeliveryPackages(
  input: unknown,
  legacyInput: unknown,
  path: string,
  errors: string[],
): ParsedDeliveryPackages | undefined {
  const legacy = legacyInput === null || legacyInput === undefined
    ? undefined
    : parseProductDimensions(legacyInput, `${path}.packageDimensions`, errors);

  if (input === undefined) {
    if (legacyInput !== null && legacyInput !== undefined && legacy === undefined) {
      return undefined;
    }
    return {
      values: legacy === undefined ? [] : [legacy],
    };
  }
  if (!Array.isArray(input) || input.length > MAX_PACKAGES_PER_PRODUCT) {
    errors.push(
      `${path}.packages must be an array of at most ${MAX_PACKAGES_PER_PRODUCT} complete packages.`,
    );
    return undefined;
  }

  const before = errors.length;
  const values = input.flatMap((entry, index) => {
    const packagePath = `${path}.packages[${index}]`;
    const dimensions = parseProductDimensions(entry, packagePath, errors);
    if (!isRecord(entry) || dimensions === undefined) {
      return [];
    }
    const label = entry.label === undefined
      ? undefined
      : readTrimmedString(entry.label, `${packagePath}.label`, errors, 120);
    if (entry.label !== undefined && label === undefined) {
      return [];
    }
    return [{ ...dimensions, ...(label === undefined ? {} : { label }) }];
  });
  if (
    errors.length > before ||
    (legacyInput !== null && legacyInput !== undefined && legacy === undefined)
  ) {
    return undefined;
  }
  return {
    values,
  };
}

function evidenceMatchesDimensions(
  evidence: string,
  dimensions: ProductDimensions,
): boolean {
  const labelled = readLabelledEvidenceDimensions(evidence);
  if (labelled !== undefined) {
    return (
      labelled.widthMm === dimensions.widthMm &&
      labelled.heightMm === dimensions.heightMm &&
      labelled.depthMm === dimensions.depthMm
    );
  }
  return (
    readEvidenceMillimetres(evidence, "width") === dimensions.widthMm &&
    readEvidenceMillimetres(evidence, "height") === dimensions.heightMm &&
    readEvidenceMillimetres(evidence, "depth") === dimensions.depthMm
  );
}

function readLabelledEvidenceDimensions(evidence: string): ProductDimensions | undefined {
  const valueThenLegend = evidence.match(
    /(\d+(?:\.\d+)?)\s*(mm|cm|m)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\s*\(\s*([whd])\s*[x×]\s*([whd])\s*[x×]\s*([whd])\s*\)/i,
  );
  if (valueThenLegend !== null) {
    return dimensionsFromAxisEntries([
      [valueThenLegend[7], valueThenLegend[1], valueThenLegend[2]],
      [valueThenLegend[8], valueThenLegend[3], valueThenLegend[4]],
      [valueThenLegend[9], valueThenLegend[5], valueThenLegend[6]],
    ]);
  }

  const axisAfterValue = evidence.match(
    /(\d+(?:\.\d+)?)\s*([whd])\s*[x×]\s*(\d+(?:\.\d+)?)\s*([whd])\s*[x×]\s*(\d+(?:\.\d+)?)\s*([whd])\s*(mm|cm|m)\b/i,
  );
  if (axisAfterValue !== null) {
    return dimensionsFromAxisEntries([
      [axisAfterValue[2], axisAfterValue[1], axisAfterValue[7]],
      [axisAfterValue[4], axisAfterValue[3], axisAfterValue[7]],
      [axisAfterValue[6], axisAfterValue[5], axisAfterValue[7]],
    ]);
  }
  return undefined;
}

function dimensionsFromAxisEntries(
  entries: readonly (readonly [string, string, string])[],
): ProductDimensions | undefined {
  const values = new Map<string, number>();
  for (const [rawAxis, rawValue, rawUnit] of entries) {
    const axis = rawAxis.toLowerCase();
    if ((axis !== "w" && axis !== "h" && axis !== "d") || values.has(axis)) {
      return undefined;
    }
    const value = convertEvidenceValue(rawValue, rawUnit);
    if (value === undefined) {
      return undefined;
    }
    values.set(axis, value);
  }
  const widthMm = values.get("w");
  const heightMm = values.get("h");
  const depthMm = values.get("d");
  return widthMm === undefined || heightMm === undefined || depthMm === undefined
    ? undefined
    : { widthMm, heightMm, depthMm };
}

function convertEvidenceValue(rawValue: string, rawUnit: string): number | undefined {
  const value = Number(rawValue);
  const unit = rawUnit.toLowerCase();
  const factor = unit === "mm" ? 1 : unit === "cm" ? 10 : unit === "m" ? 1_000 : undefined;
  if (!Number.isFinite(value) || factor === undefined) {
    return undefined;
  }
  const millimetres = value * factor;
  return Number.isInteger(millimetres) ? millimetres : undefined;
}

function readEvidenceMillimetres(
  evidence: string,
  axis: "width" | "height" | "depth",
): number | undefined {
  const match = evidence.match(
    new RegExp(`\\b${axis}\\b[^\\d]{0,32}(\\d+(?:\\.\\d+)?)\\s*(mm|cm|m)\\b`, "i"),
  );
  if (match === null) {
    return undefined;
  }
  return convertEvidenceValue(match[1], match[2]);
}

function parseProductDimensions(
  input: unknown,
  path: string,
  errors: string[],
): ProductDimensions | undefined {
  if (!isRecord(input)) {
    errors.push(`${path} must be an object.`);
    return undefined;
  }
  const widthMm = boundedInteger(input.widthMm, `${path}.widthMm`, errors, 1, MAX_MEASUREMENT_MM);
  const heightMm = boundedInteger(input.heightMm, `${path}.heightMm`, errors, 1, MAX_MEASUREMENT_MM);
  const depthMm = boundedInteger(input.depthMm, `${path}.depthMm`, errors, 1, MAX_MEASUREMENT_MM);
  return widthMm === undefined || heightMm === undefined || depthMm === undefined
    ? undefined
    : { widthMm, heightMm, depthMm };
}

function boundedInteger(
  input: unknown,
  path: string,
  errors: string[],
  minimum = MIN_MEASUREMENT_MM,
  maximum = MAX_MEASUREMENT_MM,
): number | undefined {
  if (!Number.isInteger(input) || typeof input !== "number" || input < minimum || input > maximum) {
    errors.push(`${path} must be a whole number from ${minimum} to ${maximum}.`);
    return undefined;
  }
  return input;
}

function readTrimmedString(
  input: unknown,
  path: string,
  errors: string[],
  maximumLength: number,
): string | undefined {
  if (typeof input !== "string" || input.trim().length === 0 || input.trim().length > maximumLength) {
    errors.push(`${path} must be a non-empty string of at most ${maximumLength} characters.`);
    return undefined;
  }
  return input.trim();
}

function readCurrency(
  input: unknown,
  path: string,
  errors: string[],
): string | undefined {
  if (
    typeof input !== "string" ||
    !/^[A-Z]{3}$/.test(input) ||
    !ISO_4217_CURRENCIES.has(input)
  ) {
    errors.push(`${path} must be an uppercase ISO-4217 three-letter code.`);
    return undefined;
  }
  return input;
}

function readHttpsUrl(input: unknown, path: string, errors: string[]): string | undefined {
  if (typeof input !== "string" || input.length > 2_048) {
    errors.push(`${path} must be an HTTPS URL.`);
    return undefined;
  }
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username.length > 0 || url.password.length > 0) {
      throw new Error("invalid");
    }
    url.hash = "";
    return url.toString();
  } catch {
    errors.push(`${path} must be an HTTPS URL.`);
    return undefined;
  }
}

function readRetailerUrl(
  input: unknown,
  retailer: RetailerIdentity,
  path: string,
  errors: string[],
): string | undefined {
  const normalized = readHttpsUrl(input, path, errors);
  if (normalized === undefined) {
    return undefined;
  }
  const host = new URL(normalized).hostname.toLowerCase();
  const liveRetailer = LIVE_RETAILERS.includes(retailer.key as LiveRetailer)
    ? (retailer.key as LiveRetailer)
    : undefined;
  const allowedHosts = liveRetailer === undefined
    ? [retailer.host]
    : ALLOWED_RETAILER_HOSTS[liveRetailer];
  const allowed = allowedHosts.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
  if (!allowed) {
    errors.push(`${path} is not on the declared ${retailer.key} domain.`);
    return undefined;
  }
  return normalized;
}

function readRetailerImageUrl(
  input: unknown,
  retailer: RetailerIdentity,
  path: string,
  errors: string[],
): string | undefined {
  const normalized = readHttpsUrl(input, path, errors);
  if (normalized === undefined) {
    return undefined;
  }
  const host = new URL(normalized).hostname.toLowerCase();
  const liveRetailer = LIVE_RETAILERS.includes(retailer.key as LiveRetailer)
    ? (retailer.key as LiveRetailer)
    : undefined;
  if (liveRetailer !== undefined) {
    const allowed = ALLOWED_RETAILER_IMAGE_HOSTS[liveRetailer].some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
    if (!allowed) {
      errors.push(`${path} is not on an approved ${retailer.key} image host.`);
      return undefined;
    }
  }
  return normalized;
}

function readRetailerHost(
  input: unknown,
  path: string,
  errors: string[],
): string | undefined {
  if (typeof input !== "string" || input.length > 253) {
    errors.push(`${path} must be a DNS hostname.`);
    return undefined;
  }
  const normalized = input.toLowerCase().replace(/\.$/, "");
  if (
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      normalized,
    )
  ) {
    errors.push(`${path} must be a DNS hostname.`);
    return undefined;
  }
  return normalized;
}

function readIsoDate(
  input: unknown,
  path: string,
  errors: string[],
  options: ValidateObservationOptions = {},
): string | undefined {
  if (typeof input !== "string" || Number.isNaN(Date.parse(input))) {
    errors.push(`${path} must be an ISO timestamp.`);
    return undefined;
  }
  const observedAt = new Date(input);
  const now = Date.now();
  const maxAge = options.maxObservationAgeMs ?? DEFAULT_MAX_OBSERVATION_AGE_MS;
  if (observedAt.getTime() > now + 5 * 60_000 || observedAt.getTime() < now - maxAge) {
    errors.push(`${path} must describe the current search observation.`);
    return undefined;
  }
  return observedAt.toISOString();
}

function readStringArray(
  input: unknown,
  path: string,
  errors: string[],
  maximumItems: number,
  maximumLength: number,
): readonly string[] | undefined {
  if (!Array.isArray(input) || input.length > maximumItems) {
    errors.push(`${path} must be an array of at most ${maximumItems} strings.`);
    return undefined;
  }
  const before = errors.length;
  const values = input.flatMap((entry, index) => {
    const parsed = readTrimmedString(entry, `${path}[${index}]`, errors, maximumLength);
    return parsed === undefined ? [] : [parsed];
  });
  return errors.length === before ? values : undefined;
}

function failure<T>(message: string): ValidationResult<T> {
  return { ok: false, errors: [message] };
}

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
