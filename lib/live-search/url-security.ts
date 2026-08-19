import "server-only";

import { BlockList, isIP } from "node:net";
import { parse as parseDomain } from "tldts";

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "_ga",
  "_gl",
  "ref_src",
  // Google Shopping click id; Kmart search results carry it on every product URL
  // and it made the same product look like a different one per visit.
  "srsltid",
]);

const NON_PUBLIC_IPS = createNonPublicIpBlockList();

export class UnsafePublicUrlError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "UnsafePublicUrlError";
  }
}

/**
 * Canonicalizes a user-supplied public product URL without removing parameters
 * that may select a real product variant.
 */
export function canonicalizePublicProductUrl(value: string): string {
  const url = parsePublicHttpsUrl(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    const normalized = key.toLowerCase();
    if (normalized.startsWith("utm_") || TRACKING_PARAMETERS.has(normalized)) {
      url.searchParams.delete(key);
    }
  }
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  url.searchParams.sort();
  return url.toString();
}

/** Rejects URL forms that could reach local, reserved, or credentialed hosts. */
export function parsePublicHttpsUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafePublicUrlError("Enter a complete HTTPS product URL.");
  }
  if (url.protocol !== "https:") {
    throw new UnsafePublicUrlError("Product links must use HTTPS.");
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new UnsafePublicUrlError("Product links cannot contain credentials.");
  }
  if (url.port.length > 0 && url.port !== "443") {
    throw new UnsafePublicUrlError("Product links cannot use a nonstandard port.");
  }
  const hostname = normalizeHostname(url.hostname);
  if (
    hostname.length === 0 ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isIP(hostname) !== 0
  ) {
    throw new UnsafePublicUrlError("Product links must use a public retailer hostname.");
  }
  return url;
}

/** Confirms a provider-returned canonical URL stayed on the submitted site. */
export function hasSameRegistrableDomain(left: string, right: string): boolean {
  const leftDomain = registrableDomain(parsePublicHttpsUrl(left).hostname);
  const rightDomain = registrableDomain(parsePublicHttpsUrl(right).hostname);
  return leftDomain === rightDomain;
}

export function registrableDomain(hostname: string): string {
  const normalized = normalizeHostname(hostname);
  const result = parseDomain(normalized, {
    allowIcannDomains: true,
    allowPrivateDomains: true,
    extractHostname: false,
    validateHostname: true,
  });
  if (
    result.domain === null ||
    result.isIp ||
    (!result.isIcann && !result.isPrivate)
  ) {
    throw new UnsafePublicUrlError("Product links must use a registrable public domain.");
  }
  return result.domain;
}

/** Rejects private, loopback, link-local, multicast, documentation, and reserved IPs. */
export function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  return (version === 4 || version === 6) && !NON_PUBLIC_IPS.check(address, version === 4 ? "ipv4" : "ipv6");
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
}

function createNonPublicIpBlockList(): BlockList {
  const blockList = new BlockList();
  const ipv4Subnets = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ] as const;
  for (const [network, prefix] of ipv4Subnets) {
    blockList.addSubnet(network, prefix, "ipv4");
  }

  const ipv6Subnets = [
    ["::", 128],
    ["::1", 128],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
    ["2001:2::", 48],
    ["2001:10::", 28],
    ["2001:20::", 28],
    ["2001:db8::", 32],
  ] as const;
  for (const [network, prefix] of ipv6Subnets) {
    blockList.addSubnet(network, prefix, "ipv6");
  }
  return blockList;
}
