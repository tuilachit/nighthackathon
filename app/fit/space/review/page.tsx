import type { Metadata } from "next";
import { JourneyRouteSlot } from "../../_components/JourneyRouteSlot";

export const metadata: Metadata = {
  title: "Review measurements · Fitment",
  description: "Confirm the measured envelope before searching retailers.",
};

export default function FitSpaceReviewPage(): React.JSX.Element {
  return <JourneyRouteSlot kind="space-review" />;
}
