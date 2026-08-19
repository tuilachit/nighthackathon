import type { BrowserSearchOutput, LiveProductObservation, LiveSearchIntent } from "@/lib/live-search/types";

/**
 * Deterministic relevance matching for catalog serving.
 *
 * The live path relies on the search provider to return relevant URLs and only
 * checks the retailer domain afterwards; the catalog has no such provider, so it
 * must decide relevance itself. This is pure and testable: it never invents
 * facts, it only filters and orders products the backfill already validated.
 */

export interface CatalogMatch {
  readonly observation: LiveProductObservation;
  readonly score: number;
}

// Words that describe the kind of item, grouped so a query for "bookshelf"
// matches a product named "bookcase". Membership is checked against the product
// name and category text.
const CATEGORY_SYNONYMS: readonly (readonly string[])[] = [
  ["bookshelf", "bookcase", "bookshelves", "bookcases", "shelf", "shelves", "shelving"],
  ["sideboard", "buffet", "credenza"],
  ["drawers", "drawer", "chest", "tallboy"],
  ["tv", "media", "entertainment"],
  ["cabinet", "cupboard"],
];

const STOPWORDS = new Set([
  "a", "an", "the", "for", "with", "and", "or", "of", "in", "to", "my", "me",
  "i", "need", "want", "looking", "under", "below", "less", "than", "cheap",
  "budget", "around", "about", "some", "any", "that", "fits", "fit",
]);

/** Parses a maximum price in minor units from phrases like "under $250" or "below 250". */
export function parsePriceCapMinor(text: string): number | undefined {
  const match = text.match(/(?:under|below|less than|<=?|max|up to)\s*\$?\s*(\d[\d,]*)(?:\.(\d{2}))?/i)
    ?? text.match(/\$\s*(\d[\d,]*)(?:\.(\d{2}))?/);
  if (match === null) {
    return undefined;
  }
  const whole = Number((match[1] ?? "").replace(/,/g, ""));
  const cents = match[2] === undefined ? 0 : Number(match[2].padEnd(2, "0").slice(0, 2));
  const minor = whole * 100 + cents;
  return Number.isSafeInteger(minor) && minor > 0 ? minor : undefined;
}

/** Query keywords: lowercased, de-punctuated, stopwords and the price phrase removed. */
export function queryKeywords(text: string): readonly string[] {
  const withoutPrice = text.replace(/(?:under|below|less than|<=?|max|up to)?\s*\$?\s*\d[\d,.]*/gi, " ");
  return [...new Set(
    withoutPrice
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !STOPWORDS.has(token)),
  )];
}

function synonymGroup(keyword: string): readonly string[] | undefined {
  return CATEGORY_SYNONYMS.find((group) => group.includes(keyword));
}

/**
 * Scores a product against the query. A category keyword contributes when the
 * product name or category contains any of its synonyms; other keywords (colour,
 * material) contribute when they appear directly. Returns 0 when nothing matches
 * so the caller can drop it.
 */
export function scoreObservation(observation: LiveProductObservation, keywords: readonly string[]): number {
  const haystack = `${observation.name} ${observation.category}`.toLowerCase();
  let score = 0;
  let categoryMatched = false;
  let categoryRequested = false;
  for (const keyword of keywords) {
    const group = synonymGroup(keyword);
    if (group !== undefined) {
      categoryRequested = true;
      if (group.some((synonym) => haystack.includes(synonym))) {
        categoryMatched = true;
        score += 2;
      }
      continue;
    }
    if (haystack.includes(keyword)) {
      score += 1;
    }
  }
  // If the query asked for a specific kind of item and this product is a
  // different kind, it is not a relevant result regardless of colour matches.
  if (categoryRequested && !categoryMatched) {
    return 0;
  }
  return score;
}

/**
 * Filters catalog observations to those matching the intent and orders them by
 * relevance. Retailer scope and the price cap are hard filters; keyword score
 * ranks the rest. Ties keep a stable order by lower price then name.
 */
export function rankCatalogMatches(
  observations: readonly LiveProductObservation[],
  intent: LiveSearchIntent,
): readonly CatalogMatch[] {
  if (intent.kind !== "prompt") {
    return [];
  }
  const keywords = queryKeywords(intent.text);
  const priceCap = parsePriceCapMinor(intent.text);
  const retailers = new Set(intent.retailers);

  const matches: CatalogMatch[] = [];
  for (const observation of observations) {
    if (!retailers.has(observation.retailer.key as never)) {
      continue;
    }
    if (priceCap !== undefined && observation.priceMinor > priceCap) {
      continue;
    }
    const score = keywords.length === 0 ? 1 : scoreObservation(observation, keywords);
    if (score <= 0) {
      continue;
    }
    matches.push({ observation, score });
  }

  return matches.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (left.observation.priceMinor !== right.observation.priceMinor) {
      return left.observation.priceMinor - right.observation.priceMinor;
    }
    return left.observation.name.localeCompare(right.observation.name);
  });
}

/** Builds the search output the live pipeline consumes from ranked catalog matches. */
export function catalogSearchOutput(
  matches: readonly CatalogMatch[],
  limit: number,
): BrowserSearchOutput {
  return {
    products: matches.slice(0, limit).map((match) => match.observation),
    partial: false,
    notes: [],
  };
}
