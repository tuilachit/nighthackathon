import { NextResponse } from "next/server";
import { refineConceptQuestions } from "@/lib/concept-refinement";

interface RefineRequestBody {
  readonly prompt?: string;
  readonly imageDataUrl?: string | null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as RefineRequestBody;
  const prompt = body.prompt?.trim();

  if (prompt === undefined || prompt.length === 0) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  if (body.imageDataUrl !== undefined && body.imageDataUrl !== null && body.imageDataUrl.length > 12_000_000) {
    return NextResponse.json({ error: "Image data is too large. Use an image smaller than 8 MB." }, { status: 413 });
  }

  const refinement = await refineConceptQuestions({
    prompt,
    imageDataUrl: body.imageDataUrl,
  });

  return NextResponse.json({ refinement });
}
