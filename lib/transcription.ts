const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

interface TranscriptionResponse {
  readonly text?: unknown;
}

export async function transcribeFurnitureQuery(
  audio: File,
): Promise<string | undefined> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return undefined;
  }

  const formData = new FormData();
  formData.set("model", process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe");
  formData.set(
    "prompt",
    "The speaker is describing furniture to fit a measured space. Preserve retailer, category, material, color, style, and price words exactly.",
  );
  formData.set("file", audio, audio.name);

  try {
    const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return undefined;
    }

    const data = (await response.json()) as TranscriptionResponse;
    return typeof data.text === "string" && data.text.trim().length > 0
      ? data.text.trim()
      : undefined;
  } catch {
    return undefined;
  }
}
