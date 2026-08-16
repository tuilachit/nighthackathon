import type { Metadata } from "next";
import { LiveSearchExperience } from "@/components/agent/LiveSearchExperience";

export const metadata: Metadata = {
  title: "Live Australian furniture search",
  description:
    "Search current IKEA Australia and Kmart Australia products, check their listed dimensions, and approve an AI-generated 3D model rescaled to those outer bounds.",
};

export default function AgentPage(): React.JSX.Element {
  return <LiveSearchExperience />;
}
