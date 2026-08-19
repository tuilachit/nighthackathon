import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  createPinnedLookup,
  fetchBoundedPublicImage,
  normalizeImageForModel,
  validateImageBytes,
} from "./image-cache";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webp = Buffer.from("RIFF0000WEBPpayload", "ascii");
const avif = Buffer.from("0000ftypavifpayload", "ascii");

describe("validateImageBytes", () => {
  it.each([
    ["image/jpeg", jpeg],
    ["image/png", png],
    ["image/webp", webp],
    ["image/avif", avif],
  ])("accepts matching %s bytes", (contentType, body) => {
    expect(validateImageBytes(contentType, body)).toBe(contentType);
  });

  it("rejects SVG and MIME/signature disagreement", () => {
    expect(() => validateImageBytes("image/svg+xml", Buffer.from("<svg/>"))).toThrow();
    expect(() => validateImageBytes("image/png", jpeg)).toThrow();
  });
});

describe("normalizeImageForModel", () => {
  it("converts validated WebP bytes to a Meshy-compatible bounded PNG", async () => {
    const source = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 30, g: 60, b: 90, alpha: 1 },
      },
    }).webp().toBuffer();

    const normalized = await normalizeImageForModel(source, "image/webp");

    expect(normalized.contentType).toBe("image/png");
    expect(validateImageBytes("image/png", normalized.body)).toBe("image/png");
  });

  it("converts validated AVIF bytes to a Meshy-compatible bounded PNG", async () => {
    const source = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 90, g: 60, b: 30, alpha: 1 },
      },
    }).avif().toBuffer();

    const normalized = await normalizeImageForModel(source, "image/avif");

    expect(normalized.contentType).toBe("image/png");
    expect(validateImageBytes("image/png", normalized.body)).toBe("image/png");
  });

  it("keeps supported PNG bytes unchanged after decoding under the pixel cap", async () => {
    const source = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 30, g: 60, b: 90 },
      },
    }).png().toBuffer();

    const normalized = await normalizeImageForModel(source, "image/png");

    expect(normalized).toEqual({ body: source, contentType: "image/png" });
  });
});

describe("fetchBoundedPublicImage", () => {
  it("pins DNS again after validating a redirect target", async () => {
    const resolve = vi.fn()
      .mockResolvedValueOnce({ address: "1.1.1.1", family: 4 })
      .mockResolvedValueOnce({ address: "8.8.8.8", family: 4 });
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 302, headers: { location: "https://cdn.example.net/photo.jpg" }, body: Buffer.alloc(0) })
      .mockResolvedValueOnce({ status: 200, headers: { "content-type": "image/jpeg" }, body: jpeg });
    const result = await fetchBoundedPublicImage("https://shop.example.com/item.jpg", { resolve, request });
    expect(result.finalUrl).toBe("https://cdn.example.net/photo.jpg");
    expect(resolve).toHaveBeenNthCalledWith(1, "shop.example.com");
    expect(resolve).toHaveBeenNthCalledWith(2, "cdn.example.net");
  });

  it("rejects a fourth redirect", async () => {
    const resolve = vi.fn().mockResolvedValue({ address: "1.1.1.1", family: 4 });
    const request = vi.fn().mockResolvedValue({ status: 302, headers: { location: "https://example.com/again" }, body: Buffer.alloc(0) });
    await expect(fetchBoundedPublicImage("https://example.com/image", { resolve, request })).rejects.toThrow("redirect limit");
  });
});

describe("createPinnedLookup", () => {
  it("returns the pinned address in Node's all-address callback shape", async () => {
    const lookup = createPinnedLookup({ address: "1.1.1.1", family: 4 });
    const result = await new Promise<unknown>((resolve, reject) => {
      lookup("cdn.example.com", { all: true }, (error, address) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(address);
      });
    });

    expect(result).toEqual([{ address: "1.1.1.1", family: 4 }]);
  });

  it("returns the pinned address in Node's single-address callback shape", async () => {
    const lookup = createPinnedLookup({ address: "2606:4700:4700::1111", family: 6 });
    const result = await new Promise<unknown>((resolve, reject) => {
      lookup("cdn.example.com", {}, (error, address, family) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve({ address, family });
      });
    });

    expect(result).toEqual({ address: "2606:4700:4700::1111", family: 6 });
  });
});
