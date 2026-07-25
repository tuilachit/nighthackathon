import type { FurnitureCategory, FurnitureQuery } from "./catalog-types";

const CATEGORY_MATCHERS: ReadonlyArray<readonly [FurnitureCategory, readonly string[]]> = [
  ["drawer-unit", ["drawer unit", "drawers", "drawer"]],
  ["sideboard", ["sideboard", "credenza", "cabinet"]],
  ["shelving-unit", ["shelving unit", "shelf unit", "shelving", "shelves"]],
  ["bookcase", ["bookcase", "bookshelf", "book shelf"]],
];

const MATERIALS = ["oak", "walnut", "pine", "wood", "metal", "steel", "particleboard"] as const;
const COLORS = ["white", "black", "brown", "natural", "gray", "grey", "blue", "pink"] as const;
const STYLES = ["warm", "narrow", "slim", "modern", "minimalist", "industrial", "farmhouse"] as const;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "me",
  "of",
  "something",
  "the",
  "under",
  "unit",
  "with",
]);

export function parseFurnitureQuery(input: string): FurnitureQuery {
  const normalized = normalizeText(input);
  const category = CATEGORY_MATCHERS.find(([, matchers]) =>
    matchers.some((matcher) => normalized.includes(matcher)),
  )?.[0];
  const maxPrice = parseMaxPrice(normalized);
  const materials = findTokens(normalized, MATERIALS);
  const colors = findTokens(normalized, COLORS).map((color) => (color === "grey" ? "gray" : color));
  const styles = findTokens(normalized, STYLES);

  const claimedTokens = new Set([
    ...materials,
    ...colors,
    ...styles,
    ...CATEGORY_MATCHERS.flatMap(([, matchers]) => matchers.flatMap((matcher) => matcher.split(" "))),
  ]);
  const keywords = normalized
    .replace(/\$?\d+(?:\.\d{1,2})?/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token) && !claimedTokens.has(token));

  return {
    ...(category === undefined ? {} : { category }),
    ...(maxPrice === undefined ? {} : { maxPrice }),
    materials: unique(materials),
    colors: unique(colors),
    styles: unique(styles),
    keywords: unique(keywords),
  };
}

export function mergeFurnitureQueries(
  localQuery: FurnitureQuery,
  enhancement: FurnitureQuery,
): FurnitureQuery {
  return {
    category: localQuery.category ?? enhancement.category,
    maxPrice: localQuery.maxPrice ?? enhancement.maxPrice,
    materials: unique([...localQuery.materials, ...enhancement.materials]),
    colors: unique([...localQuery.colors, ...enhancement.colors]),
    styles: unique([...localQuery.styles, ...enhancement.styles]),
    keywords: unique([...localQuery.keywords, ...enhancement.keywords]),
  };
}

export function parseFurnitureQueryValue(value: unknown): FurnitureQuery | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const category = typeof value.category === "string" ? normalizeCategory(value.category) : undefined;
  const maxPrice =
    typeof value.maxPrice === "number" && Number.isFinite(value.maxPrice) && value.maxPrice > 0
      ? value.maxPrice
      : undefined;
  const materials = parseStringArray(value.materials);
  const colors = parseStringArray(value.colors);
  const styles = parseStringArray(value.styles);
  const keywords = parseStringArray(value.keywords);
  if (materials === undefined || colors === undefined || styles === undefined || keywords === undefined) {
    return undefined;
  }

  return {
    ...(category === undefined ? {} : { category }),
    ...(maxPrice === undefined ? {} : { maxPrice }),
    materials,
    colors,
    styles,
    keywords,
  };
}

function parseMaxPrice(value: string): number | undefined {
  const underMatch = value.match(/(?:under|below|less than|max(?:imum)?(?: of)?)\s*\$?\s*(\d+(?:\.\d{1,2})?)/);
  const dollarMatch = value.match(/\$(\d+(?:\.\d{1,2})?)/);
  const match = underMatch?.[1] ?? dollarMatch?.[1];
  if (match === undefined) {
    return undefined;
  }
  const parsed = Number(match);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function findTokens(value: string, options: readonly string[]): string[] {
  return options.filter((option) => new RegExp(`\\b${escapeRegExp(option)}\\b`).test(value));
}

function normalizeCategory(value: string): FurnitureCategory | undefined {
  const normalized = value.trim().toLowerCase();
  return ["bookcase", "shelving-unit", "sideboard", "drawer-unit"].includes(normalized)
    ? (normalized as FurnitureCategory)
    : undefined;
}

function parseStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return undefined;
  }
  return unique(value.map((item) => item.trim().toLowerCase()).filter(Boolean));
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^\w$.-]+/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
