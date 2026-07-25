import { NextResponse } from "next/server";
import { transcribeFurnitureQuery } from "@/lib/transcription";

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
]);

export async function POST(request: Request): Promise<NextResponse> {
  const formData = await request.formData().catch(() => undefined);
  const audio = formData?.get("audio");
  if (audio === null || audio === undefined || typeof audio === "string") {
    return NextResponse.json({ error: "An audio recording is required." }, { status: 400 });
  }
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "Audio must be between 1 byte and 5 MB." },
      { status: audio.size > MAX_AUDIO_BYTES ? 413 : 400 },
    );
  }
  const baseAudioType = audio.type.split(";", 1)[0]?.toLowerCase();
  if (baseAudioType === undefined || !ALLOWED_AUDIO_TYPES.has(baseAudioType)) {
    return NextResponse.json({ error: "Unsupported audio format." }, { status: 415 });
  }

  const text = await transcribeFurnitureQuery(audio);
  if (text === undefined) {
    return NextResponse.json({ available: false }, { status: 503 });
  }

  return NextResponse.json({ available: true, text });
}
