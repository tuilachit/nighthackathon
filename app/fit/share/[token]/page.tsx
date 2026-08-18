import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicSharedComparison } from "@/components/fit/PublicSharedComparison";
import {
  hashPublicShareToken,
  isPublicShareToken,
  isPublicSharedComparisonSnapshot,
  isUnexpiredPublicShare,
  PUBLIC_SHARE_SCHEMA_VERSION,
} from "@/lib/live-search/public-share";
import { resolveComparisonShare } from "@/lib/live-search/repository";

export const runtime = "nodejs";
export const preferredRegion = "syd1";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Shared furniture comparison · Fitment",
  description: "A read-only comparison against one measured space.",
  robots: { index: false, follow: false },
};

interface PageProps {
  readonly params: Promise<{ readonly token: string }>;
}

export default async function SharedComparisonPage({ params }: PageProps): Promise<React.JSX.Element> {
  const { token } = await params;
  if (!isPublicShareToken(token)) notFound();
  const share = await resolveComparisonShare(hashPublicShareToken(token));
  if (
    share === undefined ||
    share.schemaVersion !== PUBLIC_SHARE_SCHEMA_VERSION ||
    !isUnexpiredPublicShare(share.expiresAt) ||
    !isPublicSharedComparisonSnapshot(share.payload)
  ) {
    notFound();
  }
  return <PublicSharedComparison snapshot={share.payload} />;
}
