import { describe, expect, it } from "vitest";
import {
  InvalidJsonBodyError,
  RequestBodyTooLargeError,
  readBoundedJson,
  readBoundedText,
} from "./request";

describe("bounded request bodies", () => {
  it("parses JSON within the byte budget", async () => {
    const request = new Request("https://fitment.test/api", {
      method: "POST",
      body: JSON.stringify({ query: "oak shelf" }),
    });

    await expect(readBoundedJson(request, 1_024)).resolves.toEqual({
      query: "oak shelf",
    });
  });

  it("rejects an oversized declared content length before reading", async () => {
    const request = new Request("https://fitment.test/api", {
      method: "POST",
      headers: { "Content-Length": "5000" },
      body: "{}",
    });

    await expect(readBoundedText(request, 100)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("rejects an oversized chunked body", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("12345"));
        controller.enqueue(new TextEncoder().encode("67890"));
        controller.close();
      },
    });
    const request = new Request("https://fitment.test/api", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readBoundedText(request, 8)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("https://fitment.test/api", {
      method: "POST",
      body: "{not-json",
    });

    await expect(readBoundedJson(request, 100)).rejects.toBeInstanceOf(
      InvalidJsonBodyError,
    );
  });
});
