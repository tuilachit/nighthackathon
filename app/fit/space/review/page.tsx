import type { Metadata } from "next";
import { JourneyRouteSlot } from "../../_components/JourneyRouteSlot";

export const metadata: Metadata = {
  title: "Review measurements · Fitment",
  description: "Confirm the measured envelope before searching retailers.",
};

interface FitSpaceReviewPageProps {
  readonly searchParams: Promise<{
    readonly mode?: string | readonly string[];
  }>;
}

export default async function FitSpaceReviewPage({
  searchParams,
}: FitSpaceReviewPageProps): Promise<React.JSX.Element> {
  const modeValue = firstSearchParam((await searchParams).mode);
  return (
    <JourneyRouteSlot
      kind="space-review"
      {...(modeValue === "link" ? { nextMode: "link" as const } : {})}
    />
  );
}

function firstSearchParam(
  value: string | readonly string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}
