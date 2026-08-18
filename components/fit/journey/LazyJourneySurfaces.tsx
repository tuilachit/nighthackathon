"use client";

import dynamic from "next/dynamic";

function SurfaceLoading(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fit-data min-h-24 border border-[#17221f]/25 bg-[#f4f7f5] p-4 text-xs font-bold text-[#17221f]/65"
    >
      Loading this step…
    </div>
  );
}

/** Route-loaded presentation surfaces keep comparison and model code off search entry. */
export const LazyDecisionResults = dynamic(
  () =>
    import("./DecisionResults").then((module) => module.DecisionResults),
  { loading: SurfaceLoading },
);

export const LazyDecisionComparisonScreen = dynamic(
  () =>
    import("./DecisionComparisonScreen").then(
      (module) => module.DecisionComparisonScreen,
    ),
  { loading: SurfaceLoading },
);

export const LazyGenerationReviewScreen = dynamic(
  () =>
    import("./GenerationReviewScreen").then(
      (module) => module.GenerationReviewScreen,
    ),
  { loading: SurfaceLoading },
);

export const LazyModelStatusScreen = dynamic(
  () =>
    import("./ModelStatusScreen").then((module) => module.ModelStatusScreen),
  { loading: SurfaceLoading },
);
