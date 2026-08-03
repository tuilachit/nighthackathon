import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("Fitment web app manifest", () => {
  it("uses the product identity and instrument palette", () => {
    expect(manifest()).toMatchObject({
      name: "Fitment",
      short_name: "Fitment",
      background_color: "#f4f7f5",
      theme_color: "#17221f",
      start_url: "/",
    });
  });

  it("publishes installable icon sizes", () => {
    expect(manifest().icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192" }),
        expect.objectContaining({ sizes: "512x512" }),
      ]),
    );
  });
});
