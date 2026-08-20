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

// Words that name a kind of furniture, grouped so a query for "bookshelf"
// matches a product named "bookcase".
//
// Kinds the catalog does not stock are listed deliberately. Recognising "desk"
// as a furniture kind is what makes a search for one return nothing from the
// catalog and fall through to live search, instead of a bookcase that merely
// shares the word "black". An unrecognised head noun must never degrade into
// matching on colour alone.
const CATEGORY_SYNONYMS: readonly (readonly string[])[] = [
  ["bookshelf", "bookcase", "bookshelves", "bookcases", "shelf", "shelves", "shelving"],
  ["sideboard", "buffet", "credenza"],
  ["drawers", "drawer", "chest", "tallboy", "dresser"],
  ["tv", "media", "entertainment"],
  ["cabinet", "cupboard"],
  ["desk", "workstation"],
  ["table", "dining"],
  ["wardrobe", "closet", "armoire"],
  ["nightstand", "bedside"],
  ["chair", "stool", "armchair"],
  ["sofa", "couch", "lounge"],
  ["bed", "bedframe"],
  ["mirror", "mirrors"],
  ["rug", "rugs"],
  ["lamp", "lighting"],
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

/** Whole-word match, so "bed" does not match "bedroom" and "black" still matches "black-brown". */
function mentions(haystack: string, term: string): boolean {
  return new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack);
}

/**
 * Scores a product against the query, returning 0 when it is not a relevant
 * result so the caller can drop it.
 *
 * The kind of item is decisive: if the query names one, the product must be
 * that kind, and attribute words (colour, material) only rank among products
 * that already qualify. When the query names no kind we know, every word must
 * appear — a loose partial match is what let "black desk" return bookcases.
 */
export function scoreObservation(observation: LiveProductObservation, keywords: readonly string[]): number {
  const haystack = `${observation.name} ${observation.category}`.toLowerCase();
  let score = 0;
  let categoryMatched = false;
  let categoryRequested = false;
  let unmatchedAttributes = 0;
  for (const keyword of keywords) {
    const group = synonymGroup(keyword);
    if (group !== undefined) {
      categoryRequested = true;
      if (group.some((synonym) => mentions(haystack, synonym))) {
        categoryMatched = true;
        score += 2;
      }
      continue;
    }
    if (mentions(haystack, keyword)) {
      score += 1;
    } else {
      unmatchedAttributes += 1;
    }
  }
  if (categoryRequested) {
    // The query asked for a specific kind of item; a different kind is not a
    // relevant result no matter how many attributes coincide.
    return categoryMatched ? score : 0;
  }
  // No recognised kind: only an exact-on-every-word product is safe to return,
  // otherwise the catalog would answer an unknown query with whatever shares a
  // colour. Returning nothing here lets the live search path answer instead.
  return unmatchedAttributes === 0 ? score : 0;
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
