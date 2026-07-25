import { describe, expect, it } from "vitest";
import { mergeFurnitureQueries, parseFurnitureQuery, parseFurnitureQueryValue } from "./query-parser";

describe("parseFurnitureQuery", () => {
  it("extracts the cached white wood query", () => {
    expect(parseFurnitureQuery("white wood bookcase under $50")).toMatchObject({
      category: "bookcase",
      maxPrice: 50,
      materials: ["wood"],
      colors: ["white"],
      styles: [],
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
