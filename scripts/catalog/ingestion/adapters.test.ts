import { describe, expect, it } from "vitest";
import {
  discoverIkeaProducts,
  parseIkeaProduct,
} from "./ikea";
import { parseTargetListingResponse } from "./target";
import {
  discoverWayfairProducts,
  parseWayfairProduct,
} from "./wayfair";

describe("IKEA ingestion adapter", () => {
  it("discovers products and parses verified schema.org data", () => {
    const productUrl =
      "https://www.ikea.com/us/en/p/laiva-bookcase-black-brown-40178591/";
    const categoryHtml = `
      <script type="application/ld+json">
        {
          "@graph": [{
            "@type": "CollectionPage",
            "mainEntity": {
              "itemListElement": [{
                "item": { "url": "${productUrl}" }
              }]
            }
          }]
        }
      </script>
    `;
    expect(discoverIkeaProducts(categoryHtml)).toEqual([
      { externalId: "40178591", productUrl },
    ]);

    const product = parseIkeaProduct(`
      <script type="application/ld+json">
        {
          "@type": "Product",
          "name": "LAIVA Bookcase",
          "mpn": "401.785.91",
          "width": "24 3/8",
          "height": "65",
          "depth": "9 1/2",
          "color": "Black-brown",
          "material": "Particleboard, Fiberboard",
          "description": "A minimalist narrow bookcase.",
          "category": "Bookcases",
          "image": [{
            "contentUrl": "https://www.ikea.com/images/laiva.jpg"
          }],
          "offers": {
            "price": "29.99",
            "url": "${productUrl}"
          }
        }
      </script>
    `);

    expect(product).toMatchObject({
      retailerId: "ikea",
      externalId: "40178591",
      priceUsd: 29.99,
      dimensions: { widthMm: 619, heightMm: 1651, depthMm: 241 },
      colors: ["black", "brown"],
    });
  });

  it("rejects a product when exact dimensions are absent", () => {
    expect(
      parseIkeaProduct(`
        <script type="application/ld+json">
          {"@type":"Product","name":"Incomplete"}
        </script>
      `),
    ).toBeUndefined();
  });
});

describe("Target ingestion adapter", () => {
  it("parses exact dimensions, material, price, and source URLs", () => {
    const products = parseTargetListingResponse({
      data: {
        search: {
          products: [
            {
              tcin: "54376270",
              price: { current_retail: 35 },
              item: {
                dpci: "249-10-1000",
                primary_brand: { name: "Room Essentials" },
                product_description: {
                  title: "3 Shelf Bookcase - White",
                  bullet_descriptions: [
                    "<B>Dimensions (Overall):</B> 36 Inches (H) x 24.5 Inches (W) x 9.5 Inches (D)",
                    "<B>Material:</B> Particle Board",
                    "<B>Surface Material:</B> Paper Laminate",
                  ],
                },
                enrichment: {
                  buy_url: "https://www.target.com/p/-/A-54376270",
                  image_info: {
                    primary_image: {
                      url: "https://target.scene7.com/is/image/Target/bookcase",
                      alt_text: "White three shelf bookcase",
                    },
                  },
                },
              },
            },
          ],
        },
      },
    });

    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      retailerId: "target",
      externalId: "54376270",
      dimensions: { widthMm: 622, heightMm: 914, depthMm: 241 },
      materials: ["particle board", "paper laminate"],
      colors: ["white"],
    });
  });

  it("rejects malformed listing payloads", () => {
    expect(parseTargetListingResponse({ data: null })).toEqual([]);
  });
});

describe("Wayfair ingestion adapter", () => {
  it("discovers canonical product URLs", () => {
    const products = discoverWayfairProducts(`
      <article
        data-test-id="CardWrapper"
        data-clio-context='{"displayListingID":"W123456789"}'
      >
        <a href="https://www.wayfair.com/furniture/pdp/example-w123456789.html?piid=4&utm_source=test">
          Example
        </a>
      </article>
    `);

    expect(products).toEqual([
      {
        externalId: "w123456789",
        productUrl:
          "https://www.wayfair.com/furniture/pdp/example-w123456789.html?piid=4",
      },
    ]);
  });

  it("parses sale pricing and rendered product metadata", () => {
    const productUrl =
      "https://www.wayfair.com/furniture/pdp/example-bookcase-w123456789.html?piid=4";
    const product = parseWayfairProduct(
      `
        <h1>Example Narrow Bookcase</h1>
        <span data-test-id="StandardPricingPrice-SALE">$129.99</span>
        <img
          alt="Example Narrow Bookcase, White"
          src="https://assets.wfcdn.com/im/123/resize-h800-w800/example.jpg"
        />
        <span>Color:</span><span>White</span>
        <script>
          "Overall Dimensions\\",\\"value\\":\\"41.7'' H X 19.5'' W X 9.4'' D"
          "description\\":\\"Frame Material\\",\\"additionalDetails\\":\\"Manufactured Wood"
        </script>
      `,
      productUrl,
    );

    expect(product).toMatchObject({
      retailerId: "wayfair",
      externalId: "w123456789",
      priceUsd: 129.99,
      dimensions: { widthMm: 495, heightMm: 1059, depthMm: 239 },
      materials: ["manufactured wood"],
      colors: ["white"],
    });
  });
});
