import { NextResponse } from "next/server";
import { enhanceFurnitureQuery } from "@/lib/query-enhancement";

interface ParseQueryRequest {
  readonly text?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as ParseQueryRequest;
  const text = body.text?.trim();
  if (text === undefined || text.length === 0) {
    return NextResponse.json({ error: "Query text is required." }, { status: 400 });
  }
  if (text.length > 500) {
    return NextResponse.json({ error: "Query text must be 500 characters or fewer." }, { status: 413 });
  }

  const query = await enhanceFurnitureQuery(text);
  if (query === undefined) {
    return NextResponse.json({ available: false }, { status: 503 });
  }

  return NextResponse.json({ available: true, query });
}
