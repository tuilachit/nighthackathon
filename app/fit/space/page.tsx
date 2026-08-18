import type { Metadata } from "next";
import { JourneyRouteSlot } from "../_components/JourneyRouteSlot";

export const metadata: Metadata = {
  title: "Measure your space · Fitment",
  description: "Record the destination envelope and optional delivery opening.",
};

export default function FitSpacePage(): React.JSX.Element {
  return <JourneyRouteSlot kind="space" />;
}
