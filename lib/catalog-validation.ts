import type {
  CatalogProvenance,
  CatalogProduct,
  DimensionsSource,
  FurnitureCategory,
  ProductDimensions,
  Retailer,
} from "./catalog-types";

const RETAILERS = new Set<Retailer>(["IKEA", "Target", "Wayfair"]);
const CATEGORIES = new Set<FurnitureCategory>([
  "bookcase",
  "shelving-unit",
  "sideboard",
  "drawer-unit",
]);
const DIMENSION_SOURCES = new Set<DimensionsSource>([
  "json-ld",
  "llm-extracted",
  "retailer-api",
]);

interface CatalogValidationSuccess {
  readonly ok: true;
  readonly products: readonly CatalogProduct[];
}

interface CatalogValidationFailure {
  readonly ok: false;
  readonly errors: readonly string[];
}

export type CatalogValidationResult = CatalogValidationSuccess | CatalogValidationFailure;

/** Validates every runtime catalog record without accepting a partial result. */
export function validateCatalog(input: unknown): CatalogValidationResult {
  if (!Array.isArray(input)) {
    return { ok: false, errors: ["Catalog must be an array."] };
  }

  const errors: string[] = [];
  const products: CatalogProduct[] = [];
  const ids = new Set<string>();

  input.forEach((entry, index) => {
    const path = `Product ${index + 1}`;
    if (!isRecord(entry)) {
      errors.push(`${path} must be an object.`);
      return;
    }

    const product = parseCatalogProduct(entry, path, errors);
    if (product === undefined) {
      return;
    }

    if (ids.has(product.id)) {
      errors.push(`${path} has duplicate id "${product.id}".`);
      return;
    }

    ids.add(product.id);
    products.push(product);
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, products };
}

/** Returns a fully validated catalog or throws with all validation failures. */
export function requireValidCatalog(input: unknown): readonly CatalogProduct[] {
  const result = validateCatalog(input);
  if (!result.ok) {
    throw new Error(`Catalog validation failed:\n${result.errors.join("\n")}`);
  }
  return result.products;
}

function parseCatalogProduct(
  value: Record<string, unknown>,
  path: string,
  errors: string[],
): CatalogProduct | undefined {
  const startErrorCount = errors.length;
  const id = requiredString(value.id, `${path}.id`, errors);
  const name = requiredString(value.name, `${path}.name`, errors);
  const retailerValue = requiredString(value.retailer, `${path}.retailer`, errors);
  const categoryValue = requiredString(value.category, `${path}.category`, errors);
  const priceUsd = requiredPositiveNumber(value.priceUsd, `${path}.priceUsd`, errors);
  const dimensions = parseDimensions(value.dimensions, `${path}.dimensions`, errors);
  const materials = stringArray(value.materials, `${path}.materials`, errors);
  const colors = stringArray(value.colors, `${path}.colors`, errors);
  const styles = stringArray(value.styles, `${path}.styles`, errors);
  const keywords = stringArray(value.keywords, `${path}.keywords`, errors);
  const imagePath = requiredString(value.imagePath, `${path}.imagePath`, errors);
  const imageSourceUrl =
    value.imageSourceUrl === undefined
      ? undefined
      : requiredHttpsUrl(value.imageSourceUrl, `${path}.imageSourceUrl`, errors);
  const imageAttribution =
    value.imageAttribution === undefined
      ? undefined
      : requiredString(value.imageAttribution, `${path}.imageAttribution`, errors);
  const productUrl = requiredHttpsUrl(value.productUrl, `${path}.productUrl`, errors);
  const verification = parseVerification(value.verification, `${path}.verification`, errors);
  const provenance = parseProvenance(value.provenance, `${path}.provenance`, errors);
  const model = value.model === undefined ? undefined : parseModel(value.model, `${path}.model`, errors);

  if (!RETAILERS.has(retailerValue as Retailer)) {
    errors.push(`${path}.retailer must be IKEA, Target, or Wayfair.`);
  }
  if (!CATEGORIES.has(categoryValue as FurnitureCategory)) {
    errors.push(`${path}.category is unsupported.`);
  }
  if (imagePath !== undefined && !isSupportedProductImage(imagePath)) {
    errors.push(`${path}.imagePath must reference a local product SVG or an HTTPS image.`);
  }
  if (
    imagePath !== undefined &&
    imagePath.startsWith("https://") &&
    (imageSourceUrl === undefined || imageAttribution === undefined)
  ) {
    errors.push(`${path} must include imageSourceUrl and imageAttribution for a cached retailer image.`);
  }
  if (
    dimensions !== undefined &&
    model !== undefined &&
    !dimensionsEqual(dimensions, model.nativeDimensionsMm)
  ) {
    errors.push(`${path}.model.nativeDimensionsMm must match the verified product dimensions.`);
  }

  if (
    errors.length !== startErrorCount ||
    id === undefined ||
    name === undefined ||
    priceUsd === undefined ||
    dimensions === undefined ||
    materials === undefined ||
    colors === undefined ||
    styles === undefined ||
    keywords === undefined ||
    imagePath === undefined ||
    productUrl === undefined ||
    verification === undefined ||
    provenance === undefined
  ) {
    return undefined;
  }

  return {
    id,
    name,
    retailer: retailerValue as Retailer,
    category: categoryValue as FurnitureCategory,
    priceUsd,
    dimensions,
    materials,
    colors,
    styles,
    keywords,
    imagePath,
    ...(imageSourceUrl === undefined ? {} : { imageSourceUrl }),
    ...(imageAttribution === undefined ? {} : { imageAttribution }),
    productUrl,
    verification,
    provenance,
    ...(model === undefined ? {} : { model }),
  };
}

function parseDimensions(value: unknown, path: string, errors: string[]): ProductDimensions | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} is required.`);
    return undefined;
  }

  const widthMm = requiredPositiveNumber(value.widthMm, `${path}.widthMm`, errors);
  const heightMm = requiredPositiveNumber(value.heightMm, `${path}.heightMm`, errors);
  const depthMm = requiredPositiveNumber(value.depthMm, `${path}.depthMm`, errors);
  if (widthMm === undefined || heightMm === undefined || depthMm === undefined) {
    return undefined;
  }
  return { widthMm, heightMm, depthMm };
}

function parseVerification(
  value: unknown,
  path: string,
  errors: string[],
): CatalogProduct["verification"] | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} is required for every runtime product.`);
    return undefined;
  }

  const sourceUrl = requiredHttpsUrl(value.sourceUrl, `${path}.sourceUrl`, errors);
  const verifiedAt = requiredString(value.verifiedAt, `${path}.verifiedAt`, errors);
  if (verifiedAt !== undefined && Number.isNaN(Date.parse(verifiedAt))) {
    errors.push(`${path}.verifiedAt must be an ISO date.`);
  }
  if (sourceUrl === undefined || verifiedAt === undefined) {
    return undefined;
  }
  return { sourceUrl, verifiedAt };
}

function parseProvenance(
  value: unknown,
  path: string,
  errors: string[],
): CatalogProvenance | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} is required for every runtime product.`);
    return undefined;
  }

  const dimensionsSource = requiredString(
    value.dimensionsSource,
    `${path}.dimensionsSource`,
    errors,
  );
  const sourceUrl = requiredHttpsUrl(value.sourceUrl, `${path}.sourceUrl`, errors);
  const extractedAt = requiredString(value.extractedAt, `${path}.extractedAt`, errors);

  if (!DIMENSION_SOURCES.has(dimensionsSource as DimensionsSource)) {
    errors.push(
      `${path}.dimensionsSource must be json-ld, llm-extracted, or retailer-api.`,
    );
  }
  if (extractedAt !== undefined && Number.isNaN(Date.parse(extractedAt))) {
    errors.push(`${path}.extractedAt must be an ISO date.`);
  }
  if (value.confidence !== "high") {
    errors.push(`${path}.confidence must be high.`);
  }
  if (
    dimensionsSource === undefined ||
    !DIMENSION_SOURCES.has(dimensionsSource as DimensionsSource) ||
    sourceUrl === undefined ||
    extractedAt === undefined ||
    value.confidence !== "high"
  ) {
    return undefined;
  }

  return {
    dimensionsSource: dimensionsSource as DimensionsSource,
    sourceUrl,
    extractedAt,
    confidence: "high",
  };
}

function parseModel(
  value: unknown,
  path: string,
  errors: string[],
): CatalogProduct["model"] | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return undefined;
  }
  const glbPath = requiredString(value.glbPath, `${path}.glbPath`, errors);
  const usdzPath =
    value.usdzPath === undefined ? undefined : requiredString(value.usdzPath, `${path}.usdzPath`, errors);
  const nativeDimensionsMm = parseDimensions(value.nativeDimensionsMm, `${path}.nativeDimensionsMm`, errors);
  if (value.scaleVerified !== true) {
    errors.push(`${path}.scaleVerified must be true.`);
  }
  if (glbPath !== undefined && (!glbPath.startsWith("/models/glb/") || !glbPath.endsWith(".glb"))) {
    errors.push(`${path}.glbPath must reference a local GLB.`);
  }
  if (
    usdzPath !== undefined &&
    (!usdzPath.startsWith("/models/usdz/") || !usdzPath.endsWith(".usdz"))
  ) {
    errors.push(`${path}.usdzPath must reference a local USDZ.`);
  }
  if (glbPath === undefined || nativeDimensionsMm === undefined || value.scaleVerified !== true) {
    return undefined;
  }
  return {
    glbPath,
    ...(usdzPath === undefined ? {} : { usdzPath }),
    scaleVerified: true,
    nativeDimensionsMm,
  };
}

function requiredString(value: unknown, path: string, errors: string[]): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path} is required.`);
    return undefined;
  }
  return value.trim();
}

function dimensionsEqual(left: ProductDimensions, right: ProductDimensions): boolean {
  return (
    left.widthMm === right.widthMm &&
    left.heightMm === right.heightMm &&
    left.depthMm === right.depthMm
  );
}

function requiredPositiveNumber(
  value: unknown,
  path: string,
  errors: string[],
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors.push(`${path} must be a positive number.`);
    return undefined;
  }
  return value;
}

function stringArray(value: unknown, path: string, errors: string[]): readonly string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push(`${path} must be an array of strings.`);
    return undefined;
  }
  return value.map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function requiredHttpsUrl(value: unknown, path: string, errors: string[]): string | undefined {
  const stringValue = requiredString(value, path, errors);
  if (stringValue === undefined) {
    return undefined;
  }
  try {
    const url = new URL(stringValue);
    if (url.protocol !== "https:") {
      errors.push(`${path} must use HTTPS.`);
      return undefined;
    }
    return url.toString();
  } catch {
    errors.push(`${path} must be a valid URL.`);
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSupportedProductImage(value: string): boolean {
  if (value.startsWith("/images/products/") && value.endsWith(".svg")) {
    return true;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
