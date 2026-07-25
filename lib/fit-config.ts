import type { ClearancePolicy, SpaceMeasurement } from "./catalog-types";

export const DEFAULT_CLEARANCE_POLICY: ClearancePolicy = {
  sideMm: 20,
  backMm: 20,
  topMm: 10,
};

export const DEMO_SPACE_MEASUREMENT: SpaceMeasurement = {
  widthMm: 900,
  heightMm: 1800,
  depthMm: 350,
  uncertaintyMm: 25,
  accessWidthMm: 820,
  source: "demo",
};

export const CACHED_FURNITURE_QUERIES = [
  "warm oak narrow bookshelf under $300",
  "white shelving unit under $200",
  "black slim bookcase under $250",
] as const;
