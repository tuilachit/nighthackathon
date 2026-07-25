import { describe, expect, it } from "vitest";
import { mergeFurnitureQueries, parseFurnitureQuery, parseFurnitureQueryValue } from "./query-parser";

describe("parseFurnitureQuery", () => {
  it("extracts the cached warm oak query", () => {
    expect(parseFurnitureQuery("warm oak narrow bookshelf under $300")).toMatchObject({
      category: "bookcase",
      maxPrice: 300,
      materials: ["oak"],
      styles: ["warm", "narrow"],
    });
  });

  it("extracts shelving, color, style, and budget", () => {
    expect(parseFurnitureQuery("white slim shelving unit below 200")).toMatchObject({
      category: "shelving-unit",
      maxPrice: 200,
      colors: ["white"],
      styles: ["slim"],
    });
  });

  it("returns an empty structured query for garbage input", () => {
    expect(parseFurnitureQuery("???")).toEqual({
      materials: [],
      colors: [],
      styles: [],
      keywords: [],
    });
  });
});

describe("query validation and merging", () => {
  it("preserves explicit local category and price", () => {
    const local = parseFurnitureQuery("black bookcase under $250");
    const enhancement = parseFurnitureQueryValue({
      category: "sideboard",
      maxPrice: 999,
      materials: ["metal"],
      colors: [],
      styles: ["modern"],
      keywords: [],
    });
    expect(enhancement).toBeDefined();
    expect(mergeFurnitureQueries(local, enhancement!)).toMatchObject({
      category: "bookcase",
      maxPrice: 250,
      materials: ["metal"],
      colors: ["black"],
    });
  });

  it("rejects malformed arrays", () => {
    expect(parseFurnitureQueryValue({ materials: "oak" })).toBeUndefined();
  });
});
