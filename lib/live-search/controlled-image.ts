import { ProviderResponseError } from "./providers/browser-use";

/**
 * Provenance carried by a product whose display image is our cached copy: the
 * retailer-hosted original and the sha-256 of the cached bytes. The display
 * image is content-addressed by that hash, so the pair lets any reader verify
 * exactly which retailer image the cached copy came from.
 */
export interface ControlledImageFacts {
  readonly sourceImageUrl: string;
  readonly sourceImageHash: string;
}

/**
 * Accepts only our own content-addressed image cache: https, the exact public
 * Supabase origin, the public bucket path, and a file named by the sha-256 of
 * its bytes. Anything else — another host, a query string, a mismatched hash —
 * is not a controlled cached image and must not be displayed as one.
 */
export function assertControlledCacheImage(
  urlValue: string,
  sha256: string,
  expectedOrigin: string,
): void {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new ProviderResponseError("Cached product image hash was invalid.");
  }
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new ProviderResponseError("Cached product image URL was invalid.");
  }
  const expectedPath = `/storage/v1/object/public/product-images-public/${sha256}.`;
  if (
    url.protocol !== "https:" ||
    url.origin !== expectedOrigin ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    !url.pathname.startsWith(expectedPath) ||
    !/\.(?:jpg|png)$/.test(url.pathname)
  ) {
    throw new ProviderResponseError("Cached product image was not a controlled content-addressed asset.");
  }
}
