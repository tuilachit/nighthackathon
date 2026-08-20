"use client";

import dynamic from "next/dynamic";
import type { DecisionCandidate } from "@/lib/live-search/types";
import { JourneyShell } from "./JourneyShell";

const ProductQuickLookViewer = dynamic(
  () =>
    import("@/components/fit/ProductQuickLookViewer").then(
      (module) => module.ProductQuickLookViewer,
    ),
  { ssr: false },
);

interface ModelStatusScreenProps {
  readonly candidate: DecisionCandidate;
  readonly error?: string;
  onRetry(): void;
}

/** Shows durable generation state, then lazy-loads the verified model viewer. */
export function ModelStatusScreen({
  candidate,
  error,
  onRetry,
}: ModelStatusScreenProps): React.JSX.Element {
  const asset = candidate.asset;
  if (asset === undefined) {
    return (
      <JourneyShell
        title="Generating your model"
        support="The approved product is processing. There is no fake progress bar."
        backHref={`/fit/jobs/${encodeURIComponent(candidate.workflowId)}/results?tier=fits`}
        backLabel="Results"
        status="3D generation"
      >
        <div className="mt-4 border border-[#17221f]/25 bg-[#f4f7f5] p-5 text-center">
          <div className="fit-dimension-annotation text-[#3f6b57]">
            <span className="fit-dimension-annotation__value fit-data bg-[#f4f7f5] text-[11px] font-bold uppercase tracking-[0.06em]">
              Scale verification pending
            </span>
          </div>
          <p className="mt-5 text-sm font-bold">{candidate.name}</p>
          <p className="mt-2 text-xs leading-5 text-[#17221f]/65">
            You can safely leave this screen and return from the job link.
          </p>
        </div>
        {error === undefined ? null : (
          <div className="mt-4 text-center" role="alert">
            <p className="text-sm font-semibold text-[#8a4e48]">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 min-h-11 text-sm font-bold underline underline-offset-4"
            >
              Retry status
            </button>
          </div>
        )}
      </JourneyShell>
    );
  }

  return (
    <JourneyShell
      title="Ready to place"
      support="The AI-generated model is scaled to the retailer-listed outer bounds."
      backHref={`/fit/jobs/${encodeURIComponent(candidate.workflowId)}/results?tier=fits`}
      backLabel="Results"
      status="Scale checked"
    >
      {asset.kind === "glb" ? (
        <ProductQuickLookViewer
          name={candidate.name}
          model={{
            dimensions: asset.dimensions,
            glbUrl: asset.url,
            iosUsdzUrl: asset.iosUsdzUrl,
            placeholderBoxGlbUrl: "/models/unit-box.glb",
          }}
        />
      ) : (
        <a
          href={asset.url}
          rel="ar"
          className="flex min-h-12 items-center justify-center bg-[#17221f] px-4 text-sm font-bold text-white"
        >
          View in your room
        </a>
      )}
      <p className="mt-4 text-xs leading-5 text-[#17221f]/65">
        AI-generated appearance; outer bounding-box scale checked to listed dimensions.
      </p>
    </JourneyShell>
  );
}
