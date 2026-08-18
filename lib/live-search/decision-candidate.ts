import type {
  DecisionCandidate,
  LiveCandidate,
  LiveSearchWorkflow,
} from "./types";

/** Normalizes an owner-scoped workflow candidate for route-level decision UI. */
export function toDecisionCandidate(
  workflow: LiveSearchWorkflow,
  candidate: LiveCandidate,
): DecisionCandidate {
  const observation = candidate.observation;
  return {
    key: candidate.id,
    workflowId: workflow.id,
    candidateId: candidate.id,
    retailer: observation.retailer,
    name: observation.name,
    imageUrl: observation.imageUrl,
    price: {
      minor: observation.priceMinor,
      currency: observation.currency,
    },
    availability: observation.availability,
    assembledDimensions: observation.assembledDimensions,
    packages: observation.packages,
    fitStatus: candidate.fitStatus,
    fit: candidate.fit,
    access: candidate.access,
    provenance: {
      source: observation.dimensionsSource,
      evidence: observation.dimensionsEvidence,
      observedAt: observation.observedAt,
      freshness: workflow.freshness ?? "live",
    },
    productUrl: observation.productUrl,
    ...(candidate.asset === undefined ? {} : { asset: candidate.asset }),
  };
}

export function toDecisionCandidates(
  workflow: LiveSearchWorkflow,
): readonly DecisionCandidate[] {
  return workflow.candidates.map((candidate) =>
    toDecisionCandidate(workflow, candidate),
  );
}
