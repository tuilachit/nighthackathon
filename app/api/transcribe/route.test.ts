import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function audioRequest(file: File): Request {
  const formData = new FormData();
  formData.set("audio", file);
  const request = new Request("http://localhost/api/transcribe", {
    method: "POST",
  });
  Object.defineProperty(request, "formData", { value: async () => formData });
  return request;
}

describe("POST /api/transcribe", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects unsupported audio", async () => {
    const response = await POST(audioRequest(new File(["voice"], "voice.txt", { type: "text/plain" })));
    expect(response.status).toBe(415);
  });

  it("reports unavailable without an API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await POST(
      audioRequest(new File(["voice"], "voice.webm", { type: "audio/webm;codecs=opus" })),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ available: false });
  });

  it("returns a transcript from OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "white shelf under two hundred dollars" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      audioRequest(new File(["voice"], "voice.webm", { type: "audio/webm" })),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      available: true,
      text: "white shelf under two hundred dollars",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
