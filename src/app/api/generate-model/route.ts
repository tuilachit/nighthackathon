import { NextResponse } from "next/server";
import { getInitialMeshyStatus } from "@/lib/model-generation";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    hasImage?: boolean;
  };

  const status = getInitialMeshyStatus({
    prompt: body.prompt ?? "",
    hasImage: Boolean(body.hasImage),
    enabled: process.env.NEXT_PUBLIC_ENABLE_MESHY === "true",
    apiKeyAvailable: Boolean(process.env.MESHY_API_KEY),
  });

  return NextResponse.json({
    status,
    message:
      status.state === "pending"
        ? "Meshy generation seam is ready. Wire the API client here after fallback AR is verified."
        : "Fallback AR remains ready; Meshy is optional.",
  });
}
