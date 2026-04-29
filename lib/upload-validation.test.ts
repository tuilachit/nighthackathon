import { describe, expect, it } from "vitest";
import { validateImageUpload } from "./upload-validation";

function createFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("validateImageUpload", () => {
  it("accepts valid images", () => {
    expect(validateImageUpload(createFile("sketch.png", "image/png", 128)).valid).toBe(true);
  });

  it("rejects wrong MIME types", () => {
    const result = validateImageUpload(createFile("notes.pdf", "application/pdf", 128));

    expect(result.valid).toBe(false);
  });

  it("rejects empty and oversized images", () => {
    expect(validateImageUpload(createFile("empty.png", "image/png", 0)).valid).toBe(false);
    expect(validateImageUpload(createFile("huge.png", "image/png", 7 * 1024 * 1024)).valid).toBe(false);
  });
});
