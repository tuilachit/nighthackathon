import type { ProductDimensions } from "../../../lib/catalog-types";
import {
  ProviderCreditExhaustedError,
  type IngestionMetrics,
} from "./fetchers";
import {
  isRecord,
  normalizeHttpsUrl,
  numberValue,
  stringValue,
} from "./shared";

const ANTHROPIC_MESSAGES_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_INTERVAL_MS = 1_100;
const MAX_PAGE_TEXT_CHARACTERS = 35_000;
const EXCERPT_LEADING_CHARACTERS = 8_000;
const EXCERPT_TRAILING_CHARACTERS = 5_000;
const EXCERPT_CONTEXT_BEFORE = 1_000;
const EXCERPT_CONTEXT_AFTER = 2_000;
const MAX_RELEVANT_EXCERPTS = 8;
const CREDIT_ERROR_PATTERN =
  /\b(credit|quota|billing|payment|required|insufficient|exhausted|limit reached)\b/i;

export interface ClaudeProductExtraction {
  readonly name?: string;
  readonly priceUsd?: number;
  readonly dimensions?: ProductDimensions;
  readonly materials: readonly string[];
  readonly colors: readonly string[];
  readonly styles: readonly string[];
  readonly imageUrl?: string;
  readonly productUrl?: string;
  readonly confidence: "high" | "medium" | "low";
  readonly dimensionsEvidence: string;
}

export interface ProductTextExtractor {
  extract(
    pageText: string,
    sourceUrl: string,
  ): Promise<ClaudeProductExtraction>;
}

type FetchImplementation = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export class ClaudeProductExtractor implements ProductTextExtractor {
  private lastRequestAt = 0;

  public constructor(
    private readonly apiKey: string,
    private readonly metrics: IngestionMetrics,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {}

  /**
   * Extracts only explicit retailer facts using Claude's strict JSON output.
   *
   * Callers must reject missing dimensions and any confidence below `high`.
   */
  public async extract(
    pageText: string,
    sourceUrl: string,
  ): Promise<ClaudeProductExtraction> {
    await this.waitForRateLimit();
    this.metrics.claudeCalls += 1;
    const response = await this.fetchImplementation(ANTHROPIC_MESSAGES_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1_000,
        system: [
          "Extract retailer product facts from the supplied page text.",
          "Never infer, estimate, or invent a dimension.",
          "Only return high confidence when width, height, and depth are explicitly stated",
          "for the same product and their axis labels are unambiguous.",
          "Convert explicit inch or centimetre values to whole millimetres.",
          "Use null for facts that are not explicitly present.",
        ].join(" "),
        messages: [
          {
            role: "user",
            content: `Source URL: ${sourceUrl}\n\n${buildExtractionExcerpt(
              pageText,
            )}`,
          },
        ],
        output_config: {
          format: {
            type: "json_schema",
            schema: extractionSchema,
          },
        },
      }),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      const message = `Anthropic returned HTTP ${response.status}: ${bodyText.slice(
        0,
        240,
      )}`;
      if (
        response.status === 402 ||
        response.status === 429 ||
        CREDIT_ERROR_PATTERN.test(bodyText)
      ) {
        throw new ProviderCreditExhaustedError("anthropic", message);
      }
      throw new Error(message);
    }

    const payload = parseJson(bodyText);
    if (!isRecord(payload)) {
      throw new Error("Anthropic returned an invalid response.");
    }
    if (payload.stop_reason === "max_tokens") {
      throw new Error("Anthropic structured output reached its token limit.");
    }
    const content = Array.isArray(payload.content) ? payload.content : [];
    const textBlock = content.find(
      (entry) => isRecord(entry) && entry.type === "text",
    );
    if (!isRecord(textBlock) || stringValue(textBlock.text) === undefined) {
      throw new Error("Anthropic returned no structured text block.");
    }
    return parseExtraction(
      parseJson(stringValue(textBlock.text) ?? ""),
    );
  }

  private async waitForRateLimit(): Promise<void> {
    const delay = Math.max(
      0,
      this.lastRequestAt + ANTHROPIC_INTERVAL_MS - Date.now(),
    );
    if (delay > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
    }
    this.lastRequestAt = Date.now();
  }
}

/**
 * Preserves dimension evidence from long rendered pages instead of keeping
 * only the beginning of the document.
 */
export function buildExtractionExcerpt(pageText: string): string {
  if (pageText.length <= MAX_PAGE_TEXT_CHARACTERS) {
    return pageText;
  }

  const excerpts = [pageText.slice(0, EXCERPT_LEADING_CHARACTERS)];
  const relevantPattern =
    /\b(?:overall dimensions?|product dimensions?|width|height|depth)\b/gi;
  let match: RegExpExecArray | null;
  let previousEnd = EXCERPT_LEADING_CHARACTERS;
  let relevantExcerptCount = 0;

  while (
    (match = relevantPattern.exec(pageText)) !== null &&
    relevantExcerptCount < MAX_RELEVANT_EXCERPTS
  ) {
    const start = Math.max(0, match.index - EXCERPT_CONTEXT_BEFORE);
    const end = Math.min(
      pageText.length,
      match.index + match[0].length + EXCERPT_CONTEXT_AFTER,
    );
    if (end <= previousEnd) {
      continue;
    }
    excerpts.push(pageText.slice(Math.max(start, previousEnd), end));
    previousEnd = end;
    relevantExcerptCount += 1;
  }

  excerpts.push(
    pageText.slice(Math.max(previousEnd, pageText.length - EXCERPT_TRAILING_CHARACTERS)),
  );
  return excerpts.join("\n\n[page excerpt]\n\n").slice(
    0,
    MAX_PAGE_TEXT_CHARACTERS,
  );
}

const nullableString = {
  anyOf: [{ type: "string" }, { type: "null" }],
} as const;
const nullableNumber = {
  anyOf: [{ type: "number" }, { type: "null" }],
} as const;
const stringArraySchema = {
  type: "array",
  items: { type: "string" },
} as const;

const extractionSchema = {
  type: "object",
  properties: {
    name: nullableString,
    priceUsd: nullableNumber,
    widthMm: nullableNumber,
    heightMm: nullableNumber,
    depthMm: nullableNumber,
    materials: stringArraySchema,
    colors: stringArraySchema,
    styles: stringArraySchema,
    imageUrl: nullableString,
    productUrl: nullableString,
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
    },
    dimensionsEvidence: { type: "string" },
  },
  required: [
    "name",
    "priceUsd",
    "widthMm",
    "heightMm",
    "depthMm",
    "materials",
    "colors",
    "styles",
    "imageUrl",
    "productUrl",
    "confidence",
    "dimensionsEvidence",
  ],
  additionalProperties: false,
} as const;

function parseExtraction(value: unknown): ClaudeProductExtraction {
  if (!isRecord(value)) {
    throw new Error("Anthropic structured output must be an object.");
  }
  const confidence =
    value.confidence === "high" ||
    value.confidence === "medium" ||
    value.confidence === "low"
      ? value.confidence
      : undefined;
  const dimensionsEvidence = stringValue(value.dimensionsEvidence);
  if (confidence === undefined || dimensionsEvidence === undefined) {
    throw new Error("Anthropic output omitted confidence or evidence.");
  }

  const widthMm = positiveNumber(value.widthMm);
  const heightMm = positiveNumber(value.heightMm);
  const depthMm = positiveNumber(value.depthMm);
  const dimensions =
    widthMm === undefined ||
    heightMm === undefined ||
    depthMm === undefined
      ? undefined
      : {
          widthMm: Math.round(widthMm),
          heightMm: Math.round(heightMm),
          depthMm: Math.round(depthMm),
        };
  const priceUsd = positiveNumber(value.priceUsd);

  return {
    ...(stringValue(value.name) === undefined
      ? {}
      : { name: stringValue(value.name) }),
    ...(priceUsd === undefined ? {} : { priceUsd }),
    ...(dimensions === undefined ? {} : { dimensions }),
    materials: normalizedStringArray(value.materials),
    colors: normalizedStringArray(value.colors),
    styles: normalizedStringArray(value.styles),
    ...(normalizeOptionalUrl(value.imageUrl) === undefined
      ? {}
      : { imageUrl: normalizeOptionalUrl(value.imageUrl) }),
    ...(normalizeOptionalUrl(value.productUrl) === undefined
      ? {}
      : { productUrl: normalizeOptionalUrl(value.productUrl) }),
    confidence,
    dimensionsEvidence,
  };
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = numberValue(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function normalizeOptionalUrl(value: unknown): string | undefined {
  const parsed = stringValue(value);
  return parsed === undefined ? undefined : normalizeHttpsUrl(parsed);
}

function normalizedStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
