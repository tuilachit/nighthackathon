import { NextResponse } from "next/server";
import { isMeshyMode, pollMeshyGeneration } from "@/lib/meshy-client";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");
  const mode = searchParams.get("mode");
  const refinedPrompt = searchParams.get("refinedPrompt");
  const fallbackModelPath = searchParams.get("fallbackModelPath") ?? "/models/bottle.glb";

  if (taskId === null || taskId.trim().length === 0) {
    return NextResponse.json({ error: "taskId is required." }, { status: 400 });
  }

  if (!isMeshyMode(mode)) {
    return NextResponse.json({ error: "mode must be image-to-3d or text-to-3d." }, { status: 400 });
  }

  if (refinedPrompt === null || refinedPrompt.trim().length === 0) {
    return NextResponse.json({ error: "refinedPrompt is required." }, { status: 400 });
  }

  const generation = await pollMeshyGeneration({
    taskId,
    mode,
    refinedMeshyPrompt: refinedPrompt,
    fallbackModelPath,
    allowTextFallback: searchParams.get("allowTextFallback") === "true",
  });

  return NextResponse.json({ generation });
}
