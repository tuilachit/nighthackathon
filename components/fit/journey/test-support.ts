import type {
  CandidateFitStatus,
  DecisionCandidate,
  RetailerIdentity,
} from "@/lib/live-search/types";

const RETAILERS: Readonly<Record<"ikea" | "kmart", RetailerIdentity>> = {
  ikea: { key: "ikea-au", label: "IKEA Australia", host: "ikea.com" },
  kmart: { key: "kmart-au", label: "Kmart Australia", host: "kmart.com.au" },
};

export function candidateFixture({
  key = "candidate-1",
  name = "Narrow oak shelf",
  retailer = "ikea",
  fitStatus = "fits",
  minimumClearanceMm = 25,
}: {
  readonly key?: string;
  readonly name?: string;
  readonly retailer?: "ikea" | "kmart";
  readonly fitStatus?: CandidateFitStatus;
  readonly minimumClearanceMm?: number;
} = {}): DecisionCandidate {
  const doesFitSpace = fitStatus !== "near_miss";
  const access = fitStatus === "access_issue"
    ? {
        status: "failed" as const,
        passes: false as const,
        basis: "package" as const,
        accessWidthMm: 820,
        crossSection: [
          { axis: "height" as const, sizeMm: 100 },
          { axis: "depth" as const, sizeMm: 840 },
        ] as const,
        deficitMm: 45,
        reason: "Fits the space, but 45 mm too wide for the 820 mm access opening.",
        controllingPackageIndex: 0,
        controllingPackageLabel: "Flat pack",
      }
    : fitStatus === "fits"
      ? {
          status: "passed" as const,
          passes: true as const,
          basis: "package" as const,
          accessWidthMm: 820,
          crossSection: [
            { axis: "height" as const, sizeMm: 100 },
            { axis: "depth" as const, sizeMm: 300 },
          ] as const,
          clearanceMm: 455,
          controllingPackageIndex: 0,
          controllingPackageLabel: "Flat pack",
        }
      : { status: "skipped" as const, passes: true as const, basis: "unknown" as const };

  return {
    key,
    workflowId: "00000000-0000-4000-8000-000000000001",
    candidateId: `00000000-0000-4000-8000-${key.padEnd(12, "0").slice(0, 12)}`,
    retailer: RETAILERS[retailer],
    name,
    imageUrl: `https://${RETAILERS[retailer].host}/images/${key}.jpg`,
    price: { minor: retailer === "ikea" ? 12900 : 9900, currency: "AUD" },
    availability: "in_stock",
    assembledDimensions: { widthMm: 600, heightMm: 1700, depthMm: 280 },
    packages: [
      { widthMm: 650, heightMm: 100, depthMm: 300, label: "Flat pack" },
    ],
    fitStatus,
    fit: {
      fits: doesFitSpace,
      orientation: "default",
      widthClearanceMm: doesFitSpace ? 235 : -15,
      heightClearanceMm: 65,
      depthClearanceMm: 25,
      minimumClearanceMm,
      confidence: "high",
      reasons: doesFitSpace
        ? []
        : ["15 mm too wide for the measured space."],
    },
    access,
    provenance: {
      source: retailer === "ikea" ? "retailer-page" : "json-ld",
      evidence: "Width 60 cm, height 170 cm, depth 28 cm.",
      observedAt: "2026-08-17T00:00:00.000Z",
      freshness: "live",
    },
    productUrl: `https://${RETAILERS[retailer].host}/products/${key}`,
  };
}
