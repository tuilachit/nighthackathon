import { describe, expect, it } from "vitest";
import { extractJsonLdProduct } from "./json-ld";

describe("schema.org product extraction", () => {
  it("extracts exact axis dimensions and USD product facts", () => {
    const product = extractJsonLdProduct(`
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "sku": "ABC-123",
          "name": "Narrow Oak Bookcase",
          "width": {"@type":"QuantitativeValue","value":24,"unitCode":"INH"},
          "height": {"@type":"QuantitativeValue","value":180,"unitCode":"CMT"},
          "depth": {"@type":"QuantitativeValue","value":300,"unitCode":"MMT"},
          "material": ["Oak", "Steel"],
          "color": "Natural oak",
          "image": "https://cdn.example.com/bookcase.jpg",
          "offers": {
            "@type": "Offer",
            "price": "149.99",
            "priceCurrency": "USD",
            "url": "https://www.ikea.com/us/en/p/example-12345678/"
          }
        }
      </script>
    `);

    expect(product).toMatchObject({
      externalId: "ABC-123",
      name: "Narrow Oak Bookcase",
      priceUsd: 149.99,
      dimensions: {
        widthMm: 610,
        heightMm: 1800,
        depthMm: 300,
      },
      materials: ["oak", "steel"],
      colors: ["natural", "oak"],
    });
  });

  it("does not create dimensions when any axis is absent", () => {
    const product = extractJsonLdProduct(`
      <script type="application/ld+json">
        {"@type":"Product","name":"Incomplete","width":"20","height":"40"}
      </script>
    `);
    expect(product?.dimensions).toBeUndefined();
  });
});
