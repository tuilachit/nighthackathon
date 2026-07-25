import { load } from "cheerio";
import type { FurnitureCategory, ProductDimensions } from "../../../lib/catalog-types";

const INCH_TO_MM = 25.4;
const COLOR_NAMES = [
  "black",
  "blue",
  "brown",
  "beige",
  "cherry",
  "espresso",
  "gold",
  "gray",
  "green",
  "natural",
  "oak",
  "pine",
  "silver",
  "walnut",
  "white",
  "yellow",
] as const;
const STYLE_NAMES = [
  "contemporary",
  "farmhouse",
  "industrial",
  "mid-century",
  "minimalist",
  "modern",
  "rustic",
  "scandinavian",
  "traditional",
] as const;

export function inchesToMm(value: number): number {
  return Math.round(value * INCH_TO_MM);
}

export function parseInches(value: string): number | undefined {
  const normalized = value.replace(/["″]/g, "").trim();
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    const decimal = Number.parseFloat(normalized);
    return Number.isFinite(decimal) && decimal > 0 ? decimal : undefined;
  }

  const mixed = normalized.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed !== null) {
    const whole = Number.parseInt(mixed[1], 10);
    const numerator = Number.parseInt(mixed[2], 10);
    const denominator = Number.parseInt(mixed[3], 10);
    if (denominator > 0 && numerator < denominator) {
      return whole + numerator / denominator;
    }
  }

  const fraction = normalized.match(/^(\d+)\/(\d+)$/);
  if (fraction !== null) {
    const numerator = Number.parseInt(fraction[1], 10);
    const denominator = Number.parseInt(fraction[2], 10);
    if (denominator > 0 && numerator < denominator) {
      return numerator / denominator;
    }
  }

  return undefined;
}

export function dimensionsFromInches(
  width: string | number,
  height: string | number,
  depth: string | number,
): ProductDimensions | undefined {
  const widthInches = typeof width === "number" ? width : parseInches(width);
  const heightInches = typeof height === "number" ? height : parseInches(height);
  const depthInches = typeof depth === "number" ? depth : parseInches(depth);
  if (
    widthInches === undefined ||
    heightInches === undefined ||
    depthInches === undefined ||
    widthInches <= 0 ||
    heightInches <= 0 ||
    depthInches <= 0
  ) {
    return undefined;
  }

  return {
    widthMm: inchesToMm(widthInches),
    heightMm: inchesToMm(heightInches),
    depthMm: inchesToMm(depthInches),
  };
}

export function inferCategory(name: string): FurnitureCategory {
  const normalized = name.toLowerCase();
  return normalized.includes("shelf") || normalized.includes("shelving")
    ? "shelving-unit"
    : "bookcase";
}

export function inferColors(...values: readonly string[]): readonly string[] {
  const normalized = values.join(" ").toLowerCase();
  return COLOR_NAMES.filter((color) => normalized.includes(color));
}

export function inferStyles(...values: readonly string[]): readonly string[] {
  const normalized = values.join(" ").toLowerCase();
  return STYLE_NAMES.filter((style) => normalized.includes(style));
}

export function keywordsFromName(name: string): readonly string[] {
  return [...new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 3),
  )].slice(0, 18);
}

export function decodeHtml(value: string): string {
  return load(`<span>${value}</span>`)("span").text().trim();
}

export function normalizeHttpsUrl(value: string): string | undefined {
  const withProtocol = value.startsWith("//") ? `https:${value}` : value;
  try {
    const url = new URL(withProtocol);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
