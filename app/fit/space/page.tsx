import type { Metadata } from "next";
import { JourneyRouteSlot } from "../_components/JourneyRouteSlot";

export const metadata: Metadata = {
  title: "Measure your space · Fitment",
  description: "Record the destination envelope and optional delivery opening.",
};

interface FitSpacePageProps {
  readonly searchParams: Promise<{
    readonly edit?: string | readonly string[];
    readonly mode?: string | readonly string[];
  }>;
}

export default async function FitSpacePage({
  searchParams,
}: FitSpacePageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  const edit = firstSearchParam(params.edit)?.trim();
  const mode = firstSearchParam(params.mode);
  return (
    <JourneyRouteSlot
      kind="space"
      {...(mode === "link" ? { nextMode: "link" as const } : {})}
      {...(edit === undefined || edit.length === 0
        ? {}
        : { editingSpaceId: edit })}
    />
  );
}

function firstSearchParam(
  value: string | readonly string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}
