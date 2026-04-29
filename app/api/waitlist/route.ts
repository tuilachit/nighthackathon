import { NextResponse } from "next/server";
import { createNotionWaitlistLead, parseWaitlistRequest } from "@/lib/waitlist";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => undefined)) as unknown;
  const parsed = parseWaitlistRequest(body);

  if ("status" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  }

  const result = await createNotionWaitlistLead(parsed);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, notionPageId: result.notionPageId });
}
