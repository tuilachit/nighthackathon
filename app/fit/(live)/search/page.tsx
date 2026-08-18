import type { Metadata } from "next";
import { LiveWorkflowRoute } from "@/components/agent/LiveWorkflowRoute";

export const metadata: Metadata = {
  title: "Search current furniture · Fitment",
  description: "Describe a need or check one exact public retailer product link.",
};

interface FitSearchPageProps {
  readonly searchParams: Promise<{
    readonly mode?: string | readonly string[];
    readonly prefill?: string | readonly string[];
  }>;
}

export default async function FitSearchPage({
  searchParams,
}: FitSearchPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  const modeValue = first(params.mode);
  const prefill = first(params.prefill)?.slice(0, 500) ?? "";
  return (
    <LiveWorkflowRoute
      surface="search"
      initialMode={modeValue === "link" ? "link" : "describe"}
      initialValue={prefill}
    />
  );
}

function first(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}
