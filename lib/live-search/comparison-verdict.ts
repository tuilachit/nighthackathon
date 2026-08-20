import type { DecisionCandidate } from "@/lib/live-search/types";

/**
 * Deterministic decision support for the two-product comparison. Every factor
 * is computed from facts the candidates already carry — nothing here invents,
 * estimates, or restates a number that is not on screen. The optional AI
 * insight renders alongside this, never instead of it, so the comparison is
 * exactly as useful when no model key is configured.
 */

export interface ComparisonFactor {
  /** Stable identifier for rendering and tests. */
  readonly kind: "fit" | "clearance" | "price" | "footprint" | "height";
  /** Key of the candidate this factor favours; undefined when it is a tie. */
  readonly leaderKey: string | undefined;
  /** Complete sentence stating the fact, ready to render. */
  readonly statement: string;
}

export interface ComparisonVerdict {
  readonly factors: readonly ComparisonFactor[];
  /** One- or two-sentence deterministic guidance composed from the factors. */
  readonly summary: string;
}

/** First comma-free segment of the product name, long enough to identify it. */
export function shortName(candidate: DecisionCandidate): string {
  const head = candidate.name.split(",")[0]?.trim();
  return head === undefined || head.length === 0 ? candidate.name : head;
}

function formatMoneyMinor(minor: number, currency: string): string {
  const whole = Math.floor(minor / 100);
  const cents = Math.abs(minor % 100);
  return cents === 0 ? `$${whole} ${currency}` : `$${whole}.${String(cents).padStart(2, "0")} ${currency}`;
}

export function buildComparisonVerdict(
  first: DecisionCandidate,
  second: DecisionCandidate,
): ComparisonVerdict {
  const factors: ComparisonFactor[] = [];
  const firstName = shortName(first);
  const secondName = shortName(second);

  const firstFits = first.fitStatus === "fits";
  const secondFits = second.fitStatus === "fits";
  if (firstFits !== secondFits) {
    const fitting = firstFits ? first : second;
    const failing = firstFits ? second : first;
    const failReason = failing.fit.reasons[0] ?? "it does not clear the measured envelope";
    factors.push({
      kind: "fit",
      leaderKey: fitting.key,
      statement: `Only ${shortName(fitting)} fits this space; ${shortName(failing)} does not (${failReason.replace(/\.$/, "")}).`,
    });
    return {
      factors,
      summary: `${shortName(fitting)} is the only one of the two that fits the measured space.`,
    };
  }

  const clearanceDelta = first.fit.minimumClearanceMm - second.fit.minimumClearanceMm;
  if (firstFits && secondFits && clearanceDelta !== 0) {
    const leader = clearanceDelta > 0 ? first : second;
    factors.push({
      kind: "clearance",
      leaderKey: leader.key,
      statement: `${shortName(leader)} leaves ${Math.abs(clearanceDelta)} mm more clearance in this space.`,
    });
  }

  const priceDelta = first.price.minor - second.price.minor;
  if (first.price.currency === second.price.currency && priceDelta !== 0) {
    const leader = priceDelta < 0 ? first : second;
    factors.push({
      kind: "price",
      leaderKey: leader.key,
      statement: `${shortName(leader)} costs ${formatMoneyMinor(Math.abs(priceDelta), first.price.currency)} less.`,
    });
  }

  const firstFootprint = first.assembledDimensions.widthMm * first.assembledDimensions.depthMm;
  const secondFootprint = second.assembledDimensions.widthMm * second.assembledDimensions.depthMm;
  if (firstFootprint !== secondFootprint) {
    const leader = firstFootprint < secondFootprint ? first : second;
    const other = firstFootprint < secondFootprint ? second : first;
    factors.push({
      kind: "footprint",
      leaderKey: leader.key,
      statement: `${shortName(leader)} occupies less floor space (${leader.assembledDimensions.widthMm} × ${leader.assembledDimensions.depthMm} mm vs ${other.assembledDimensions.widthMm} × ${other.assembledDimensions.depthMm} mm).`,
    });
  }

  const heightDelta = first.assembledDimensions.heightMm - second.assembledDimensions.heightMm;
  if (heightDelta !== 0) {
    const taller = heightDelta > 0 ? first : second;
    factors.push({
      kind: "height",
      leaderKey: undefined,
      statement: `${shortName(taller)} stands ${Math.abs(heightDelta)} mm taller.`,
    });
  }

  return { factors, summary: composeSummary(first, second, factors, firstName, secondName) };
}

function composeSummary(
  first: DecisionCandidate,
  second: DecisionCandidate,
  factors: readonly ComparisonFactor[],
  firstName: string,
  secondName: string,
): string {
  const clearanceLeader = factors.find((factor) => factor.kind === "clearance")?.leaderKey;
  const priceLeader = factors.find((factor) => factor.kind === "price")?.leaderKey;

  if (clearanceLeader !== undefined && clearanceLeader === priceLeader) {
    const leaderName = clearanceLeader === first.key ? firstName : secondName;
    return `${leaderName} leads on both fit margin and price.`;
  }
  if (clearanceLeader !== undefined && priceLeader !== undefined) {
    const safer = clearanceLeader === first.key ? first : second;
    const cheaper = priceLeader === first.key ? first : second;
    const saving = Math.abs(first.price.minor - second.price.minor);
    const margin = Math.abs(first.fit.minimumClearanceMm - second.fit.minimumClearanceMm);
    return `Choose ${shortName(safer)} for the safer fit (${margin} mm more clearance); choose ${shortName(cheaper)} to save ${formatMoneyMinor(saving, first.price.currency)}.`;
  }
  if (clearanceLeader !== undefined) {
    const leaderName = clearanceLeader === first.key ? firstName : secondName;
    return `Both fit at the same price point; ${leaderName} leaves the larger safety margin.`;
  }
  if (priceLeader !== undefined) {
    const leaderName = priceLeader === first.key ? firstName : secondName;
    return `Both fit with the same clearance; ${leaderName} is the cheaper way to get it.`;
  }
  return "These two are equivalent on fit and price; decide on looks and storage layout.";
}
