import "server-only";

import { lookup as dnsLookup } from "node:dns";
import type { LookupFunction } from "node:net";
import { request as httpsRequest } from "node:https";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isPublicIpAddress, parsePublicHttpsUrl } from "./url-security";

const IMAGE_BUCKET = "product-images-public";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_IMAGE_PIXELS = 40_000_000;

type SupportedImage = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

interface PinnedImageResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: Buffer;
}

export interface CachedRetailerImage {
  readonly publicUrl: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly contentType: SupportedImage;
  readonly sourceUrl: string;
}

/**
 * Fetches a retailer image with DNS pinning and copies validated bytes to a
 * content-addressed public bucket. Only the service-role client can write.
 */
export async function cacheRetailerImage(sourceUrl: string): Promise<CachedRetailerImage> {
  const downloaded = await fetchBoundedPublicImage(sourceUrl);
  const normalized = await normalizeImageForModel(downloaded.body, downloaded.contentType);
  const sha256 = createHash("sha256").update(normalized.body).digest("hex");
  const extension = imageExtension(normalized.contentType);
  const storagePath = `${sha256}.${extension}`;
  const supabase = createSupabaseAdminClient();
  const bucket = supabase.storage.from(IMAGE_BUCKET);
  const uploaded = await bucket.upload(storagePath, normalized.body, {
    cacheControl: "31536000",
    contentType: normalized.contentType,
    upsert: false,
  });
  if (uploaded.error !== null && !isDuplicateStorageError(uploaded.error)) {
    throw new Error(`Retailer image upload failed: ${uploaded.error.message}`);
  }
  if (uploaded.error !== null) {
    const existing = await bucket.download(storagePath);
    if (existing.error !== null || existing.data === null) {
      throw new Error("A duplicate retailer image could not be verified.");
    }
    const bytes = Buffer.from(await existing.data.arrayBuffer());
    if (bytes.length !== normalized.body.length || createHash("sha256").update(bytes).digest("hex") !== sha256) {
      throw new Error("A duplicate retailer image path contained different bytes.");
    }
  }
  const { data } = bucket.getPublicUrl(storagePath);
  if (!data.publicUrl.startsWith("https://")) {
    throw new Error("Storage returned an invalid public image URL.");
  }
  return {
    publicUrl: data.publicUrl,
    sha256,
    byteSize: normalized.body.length,
    contentType: normalized.contentType,
    sourceUrl: downloaded.finalUrl,
  };
}

/** Decodes every input under a pixel cap and converts modern web formats to PNG. */
export async function normalizeImageForModel(
  body: Buffer,
  contentType: SupportedImage,
): Promise<{ readonly body: Buffer; readonly contentType: "image/jpeg" | "image/png" }> {
  const decoder = sharp(body, {
    failOn: "error",
    limitInputPixels: MAX_IMAGE_PIXELS,
  });
  const metadata = await decoder.metadata();
  if (
    metadata.width === undefined ||
    metadata.height === undefined ||
    metadata.width < 1 ||
    metadata.height < 1 ||
    metadata.width * metadata.height > MAX_IMAGE_PIXELS
  ) {
    throw new Error("Retailer image dimensions exceed the safe pixel limit.");
  }
  if (contentType === "image/webp" || contentType === "image/avif") {
    const png = await decoder.png({ compressionLevel: 9 }).toBuffer();
    if (png.length === 0 || png.length > MAX_IMAGE_BYTES) {
      throw new Error("Normalized retailer image exceeds the 8 MB limit.");
    }
    return { body: png, contentType: "image/png" };
  }
  return { body, contentType };
}

export async function fetchBoundedPublicImage(
  sourceUrl: string,
  dependencies: {
    readonly resolve?: typeof resolvePublicHost;
    readonly request?: typeof requestPinnedImage;
  } = {},
): Promise<{ readonly body: Buffer; readonly contentType: SupportedImage; readonly finalUrl: string }> {
  const resolve = dependencies.resolve ?? resolvePublicHost;
  const request = dependencies.request ?? requestPinnedImage;
  let current = parsePublicHttpsUrl(sourceUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const address = await resolve(current.hostname);
    const response = await request(current, address);
    if (isRedirect(response.status)) {
      const location = response.headers.location;
      if (location === undefined || redirectCount === MAX_REDIRECTS) {
        throw new Error("Retailer image exceeded the redirect limit.");
      }
      current = parsePublicHttpsUrl(new URL(location, current).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Retailer image returned HTTP ${response.status}.`);
    }
    if (response.body.length === 0 || response.body.length > MAX_IMAGE_BYTES) {
      throw new Error("Retailer image has an invalid byte size.");
    }
    const contentType = validateImageBytes(response.headers["content-type"], response.body);
    return { body: response.body, contentType, finalUrl: current.toString() };
  }
  throw new Error("Retailer image redirect handling failed.");
}

export function validateImageBytes(contentTypeHeader: string | undefined, body: Buffer): SupportedImage {
  const contentType = contentTypeHeader?.split(";", 1)[0]?.trim().toLowerCase();
  const detected = detectImageType(body);
  if (detected === undefined || contentType !== detected) {
    throw new Error("Retailer image MIME type and file signature must be JPEG, PNG, or WebP.");
  }
  return detected;
}

async function resolvePublicHost(hostname: string): Promise<{ readonly address: string; readonly family: 4 | 6 }> {
  const answers = await new Promise<readonly { address: string; family: number }[]>((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (error, values) => {
      if (error !== null) {
        reject(error);
      } else {
        resolve(values);
      }
    });
  });
  if (answers.length === 0 || answers.some((answer) => !isPublicIpAddress(answer.address))) {
    throw new Error("Retailer image hostname did not resolve exclusively to public addresses.");
  }
  const selected = answers[0];
  if (selected.family !== 4 && selected.family !== 6) {
    throw new Error("Retailer image hostname returned an unsupported address family.");
  }
  return { address: selected.address, family: selected.family };
}

async function requestPinnedImage(
  url: URL,
  target: { readonly address: string; readonly family: 4 | 6 },
): Promise<PinnedImageResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: "GET",
        headers: { Accept: "image/avif,image/webp,image/png,image/jpeg;q=0.9" },
        lookup: createPinnedLookup(target),
        servername: url.hostname,
        timeout: REQUEST_TIMEOUT_MS,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        const declared = Number(response.headers["content-length"]);
        if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
          response.destroy(new Error("Retailer image exceeds the 8 MB limit."));
          return;
        }
        response.on("data", (chunk: Buffer | Uint8Array) => {
          total += chunk.byteLength;
          if (total > MAX_IMAGE_BYTES) {
            response.destroy(new Error("Retailer image exceeds the 8 MB limit."));
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: {
              location: arrayHeader(response.headers.location),
              "content-type": arrayHeader(response.headers["content-type"]),
            },
            body: Buffer.concat(chunks),
          });
        });
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new Error("Retailer image request timed out.")));
    request.on("error", reject);
    request.end();
  });
}

/** Preserves DNS pinning for both single-address and `all` Node lookup calls. */
export function createPinnedLookup(
  target: { readonly address: string; readonly family: 4 | 6 },
): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all === true) {
      callback(null, [{ address: target.address, family: target.family }]);
      return;
    }
    callback(null, target.address, target.family);
  };
}

function detectImageType(body: Buffer): SupportedImage | undefined {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return "image/jpeg";
  }
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (body.length >= 12 && body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (
    body.length >= 12 &&
    body.subarray(4, 8).toString("ascii") === "ftyp" &&
    ["avif", "avis"].includes(body.subarray(8, 12).toString("ascii"))
  ) {
    return "image/avif";
  }
  return undefined;
}

function imageExtension(contentType: SupportedImage): "jpg" | "png" {
  return contentType === "image/jpeg" ? "jpg" : "png";
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function arrayHeader(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" || value === undefined ? value : value[0];
}

function isDuplicateStorageError(error: { readonly message: string; readonly statusCode?: string }): boolean {
  return error.statusCode === "409" || /already exists|duplicate/i.test(error.message);
}
