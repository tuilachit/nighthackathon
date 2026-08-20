import { describe, expect, it } from "vitest";
import {
  canonicalizePublicProductUrl,
  hasSameRegistrableDomain,
  isPublicIpAddress,
  parsePublicHttpsUrl,
  registrableDomain,
} from "./url-security";

describe("canonicalizePublicProductUrl", () => {
  it("removes fragments and known tracking while preserving product variants", () => {
    expect(
      canonicalizePublicProductUrl(
        "https://WWW.example.com.au/item/desk/?variant=oak&utm_source=mail&fbclid=x#reviews",
      ),
    ).toBe("https://www.example.com.au/item/desk?variant=oak");
  });

  it("treats the same Kmart product as one URL regardless of Google Shopping click id", () => {
    // Production discovery returned every Kmart product with a distinct srsltid,
    // so identical products de-duplicated as different ones.
    const a = canonicalizePublicProductUrl(
      "https://www.kmart.com.au/product/nate-bookshelf-black-43531905?srsltid=AfmBOoqpQ5Uym",
    );
    const b = canonicalizePublicProductUrl(
      "https://www.kmart.com.au/product/nate-bookshelf-black-43531905?srsltid=AfmBOorQAXKJb",
    );
    expect(a).toBe("https://www.kmart.com.au/product/nate-bookshelf-black-43531905");
    expect(a).toBe(b);
  });

  it.each([
    "http://example.com/product",
    "https://user:secret@example.com/product",
    "https://example.com:8443/product",
    "https://127.0.0.1/product",
    "https://localhost/product",
    "https://printer.local/product",
  ])("rejects unsafe product URL %s", (value) => {
    expect(() => parsePublicHttpsUrl(value)).toThrow();
  });
});

describe("registrable domains", () => {
  it("handles Australian retailer subdomains", () => {
    expect(registrableDomain("www.ikea.com.au")).toBe("ikea.com.au");
    expect(hasSameRegistrableDomain("https://www.ikea.com.au/p/a", "https://m.ikea.com.au/p/a")).toBe(true);
    expect(hasSameRegistrableDomain("https://ikea.com.au/p/a", "https://evil.com.au/p/a")).toBe(false);
  });

  it("handles multi-label ICANN suffixes outside the old hardcoded set", () => {
    expect(registrableDomain("www.retailer.co.id")).toBe("retailer.co.id");
    expect(
      hasSameRegistrableDomain(
        "https://www.retailer.co.id/products/a",
        "https://checkout.retailer.co.id/products/a",
      ),
    ).toBe(true);
    expect(
      hasSameRegistrableDomain(
        "https://shop-a.co.id/products/a",
        "https://shop-b.co.id/products/a",
      ),
    ).toBe(false);
  });

  it.each([
    ["myshopify.com", "shop-a.myshopify.com", "shop-b.myshopify.com"],
    ["github.io", "shop-a.github.io", "shop-b.github.io"],
  ])("treats sibling tenants under private suffix %s as different registrants", (_suffix, first, second) => {
    expect(registrableDomain(`www.${first}`)).toBe(first);
    expect(hasSameRegistrableDomain(`https://${first}/a`, `https://${second}/a`)).toBe(false);
    expect(hasSameRegistrableDomain(`https://www.${first}/a`, `https://cdn.${first}/a`)).toBe(true);
  });

  it("fails closed for bare suffixes and unknown top-level domains", () => {
    expect(() => registrableDomain("github.io")).toThrow();
    expect(() => registrableDomain("retailer.not-a-real-tld")).toThrow();
  });
});

describe("isPublicIpAddress", () => {
  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("accepts public IP %s", (value) => {
    expect(isPublicIpAddress(value)).toBe(true);
  });

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.1.1",
    "192.168.1.1",
    "203.0.113.1",
    "::1",
    "0:0:0:0:0:0:0:1",
    "fd00::1",
    "2001:0db8::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0:0:0:0:0:ffff:7f00:1",
    "::ffff:169.254.169.254",
    "0:0:0:0:0:ffff:a9fe:1",
    "::ffff:10.0.0.1",
    "::ffff:192.0.2.1",
    "::ffff:224.0.0.1",
    "::ffff:240.0.0.1",
  ])(
    "rejects reserved IP %s",
    (value) => expect(isPublicIpAddress(value)).toBe(false),
  );
});
