import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { validateBrowserSearchOutput } from "@/lib/live-search/validation";
import { LIVE_RETAILER_IDENTITIES } from "@/lib/live-search/types";
import type { BrowserSearchOutput, LiveRetailer, LiveProductObservation, LiveSearchIntent } from "@/lib/live-search/types";
import { catalogSearchOutput, rankCatalogMatches } from "@/lib/live-search/catalog/relevance";

/**
 * A catalog snapshot's dimensions are durable, so serving accepts observations
 * older than the live path's 24h freshness window. Price and availability can
 * drift; that staleness is surfaced to the user rather than hidden, and a
 * refresh backfill keeps rows current. Rows older than this are treated as too
 * stale to serve at all.
 */
const CATALOG_MAX_AGE_MS = 45 * 24 * 60 * 60_000;

export interface CatalogSearchResult {
  readonly output: BrowserSearchOutput;
  /** Number of relevant catalog matches before the display limit is applied. */
  readonly matchCount: number;
}

/** Reads the latest validated snapshot per catalog product for the given retailers. */
export async function readCatalogCandidates(
  retailers: readonly LiveRetailer[],
): Promise<readonly LiveProductObservation[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("internal_latest_catalog_snapshots", {
    p_retailers: [...retailers],
  });
  if (error !== null) {
    throw new Error(`Could not read catalog snapshots: ${error.message}`);
  }
  const rows = Array.isArray(data) ? data : [];
  // Re-validate stored rows through the shared gate (with the catalog freshness
  // window) so a snapshot that drifted from the contract is dropped, not served.
  const validated = validateBrowserSearchOutput(
    { products: rows, partial: false, notes: [] },
    { maxObservationAgeMs: CATALOG_MAX_AGE_MS },
  );
  return validated.value?.products ?? [];
}

/**
 * Searches the prepared catalog for an intent. Returns the ranked, relevant
 * products capped at the display limit, honestly flagged partial when a
 * requested retailer has no catalog coverage.
 */
export async function searchCatalog(
  intent: LiveSearchIntent,
  limit: number,
): Promise<CatalogSearchResult> {
  if (intent.kind !== "prompt") {
    return { output: { products: [], partial: false, notes: [] }, matchCount: 0 };
  }
  const candidates = await readCatalogCandidates(intent.retailers);
  const matches = rankCatalogMatches(candidates, intent);
  const output = catalogSearchOutput(matches, limit);

  const represented = new Set(output.products.map((product) => product.retailer.key));
  const missing = intent.retailers.filter((retailer) => !represented.has(retailer));
  const notes = missing.map(
    (retailer) => `No catalog match yet for ${LIVE_RETAILER_IDENTITIES[retailer].label}.`,
  );

  return {
    output: {
      products: output.products,
      partial: missing.length > 0,
      notes,
    },
    matchCount: matches.length,
  };
}
