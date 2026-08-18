import type { Metadata } from "next";
import { LiveWorkflowRoute } from "@/components/agent/LiveWorkflowRoute";

export const metadata: Metadata = {
  title: "Search current furniture · Fitment",
  description: "Describe a need or check one exact public retailer product link.",
};

export default function FitSearchPage(): React.JSX.Element {
  return <LiveWorkflowRoute />;
}
