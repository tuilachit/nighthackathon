import { NextResponse } from "next/server";
import { createPrototypeFromAnalysis } from "@/lib/analyzer";
import { startMeshyGeneration } from "@/lib/meshy-client";
import { applyGeneratedModelResult, withMeshyStatus } from "@/lib/model-generation";
import { analyzeProductConcept } from "@/lib/openai-analysis";

interface StartRequestBody {
  readonly prompt?: string;
  readonly imageDataUrl?: string | null;
  readonly founderContext?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as StartRequestBody;
  const prompt = body.prompt?.trim();

  if (prompt === undefined || prompt.length === 0) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  if (body.imageDataUrl !== undefined && body.imageDataUrl !== null && body.imageDataUrl.length > 12_000_000) {
    return NextResponse.json({ error: "Image data is too large. Use an image smaller than 8 MB." }, { status: 413 });
  }

  const analysis = await analyzeProductConcept({
    prompt,
    imageDataUrl: body.imageDataUrl,
    founderContext: body.founderContext,
  });
  const fallbackSpec = createPrototypeFromAnalysis(prompt, analysis);
  const generation = await startMeshyGeneration({
    id: fallbackSpec.id,
    prompt: analysis.refinedMeshyPrompt,
    imageDataUrl: body.imageDataUrl,
    fallbackModelPath: fallbackSpec.model.glbPath,
  });

  const customGenerationUnavailable =
    generation.status === "failed" && generation.error !== undefined && /disabled|MESHY_API_KEY/i.test(generation.error);
  const prototypeSpec = customGenerationUnavailable
    ? withMeshyStatus(fallbackSpec, {
        kind: "disabled",
        reason: generation.error?.includes("MESHY_API_KEY") === true ? "missing-api-key" : "meshy-disabled",
        message: generation.error,
      })
    : applyGeneratedModelResult(fallbackSpec, generation);

  return NextResponse.json({
    prototypeSpec,
    generation,
    taskId: generation.taskId,
    mode: generation.mode,
  });
}
