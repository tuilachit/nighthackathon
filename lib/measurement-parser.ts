import type { SpaceMeasurement } from "@/lib/catalog-types";
import {
  MANUAL_BASE_UNCERTAINTY_MM,
  manualSpaceMeasurement,
} from "@/lib/measurement-geometry";

export const MEASUREMENT_FIELDS = ["width", "height", "depth", "access"] as const;
export type MeasurementField = (typeof MEASUREMENT_FIELDS)[number];

export const MEASUREMENT_UNITS = ["mm", "cm", "m", "in", "ft"] as const;
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export type MeasurementParseResult =
  | {
      readonly status: "complete";
      readonly measurement: SpaceMeasurement;
      readonly detectedUnit: MeasurementUnit;
    }
  | {
      readonly status: "incomplete";
      readonly values: Partial<Record<MeasurementField, number>>;
      readonly missing: readonly MeasurementField[];
    }
  | {
      readonly status: "invalid";
      readonly message: string;
    };

const REQUIRED_FIELDS = ["width", "height", "depth"] as const;
const NUMBER_SOURCE = "[-+]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
const UNIT_SOURCE = [
  "millimet(?:er|re)s?",
  "centimet(?:er|re)s?",
  "met(?:er|re)s?",
  "inches?",
  "feet",
  "foot",
  "mm",
  "cm",
  "ft",
  "in",
  "m",
  "[\\\"'″′]",
].join("|");
const LABEL_SOURCE = [
  "narrowest\\s+(?:access\\s+)?opening",
  "access\\s+opening",
  "doorway",
  "opening",
  "access",
  "width",
  "height",
  "depth",
  "door",
  "wide",
  "high",
  "deep",
  "w",
  "h",
  "d",
].join("|");

const ORDERED_TRIPLE_PATTERN = new RegExp(
  `(?:^|[\\s,;([{])(?<first>${NUMBER_SOURCE})\\s*(?<firstUnit>${UNIT_SOURCE})?\\s*(?:×|x|by)\\s*` +
    `(?<second>${NUMBER_SOURCE})\\s*(?<secondUnit>${UNIT_SOURCE})?\\s*(?:×|x|by)\\s*` +
    `(?<third>${NUMBER_SOURCE})\\s*(?<thirdUnit>${UNIT_SOURCE})?`,
  "gi",
);
const LABEL_BEFORE_PATTERN = new RegExp(
  `(?:^|[\\s,;([{])(?<label>${LABEL_SOURCE})\\s*(?::|=|is)?\\s*` +
    `(?<value>${NUMBER_SOURCE})\\s*(?<unit>${UNIT_SOURCE})?`,
  "gi",
);
const LABEL_AFTER_PATTERN = new RegExp(
  `(?:^|[\\s,;([{])(?<value>${NUMBER_SOURCE})\\s*(?<unit>${UNIT_SOURCE})?\\s*` +
    `(?<label>${LABEL_SOURCE})(?=$|[\\s,;.)\\]}])`,
  "gi",
);
const NUMBER_PATTERN = new RegExp(NUMBER_SOURCE, "g");
const NUMBER_WITH_WORD_PATTERN = new RegExp(
  `(${NUMBER_SOURCE})\\s*([a-zA-Z]+|[\\\"'″′])`,
  "g",
);

interface ParsedValue {
  readonly field: MeasurementField;
  readonly valueMm: number;
  readonly unit?: MeasurementUnit;
}

interface MatchRange {
  readonly start: number;
  readonly end: number;
}

/**
 * Parses a compact furniture-space measurement into canonical integer millimetres.
 * Ordered triples are always width × height × depth; delivery access must be labelled.
 */
export function parseMeasurementInput(
  input: string,
  selectedUnit: MeasurementUnit = "cm",
): MeasurementParseResult {
  if (!MEASUREMENT_UNITS.includes(selectedUnit)) {
    return { status: "invalid", message: "Choose a supported default unit." };
  }

  const normalized = input.trim();
  if (normalized.length === 0) {
    return {
      status: "incomplete",
      values: {},
      missing: [...REQUIRED_FIELDS],
    };
  }

  const unsupportedUnit = findUnsupportedUnit(normalized);
  if (unsupportedUnit !== undefined) {
    return {
      status: "invalid",
      message: `Unsupported unit “${unsupportedUnit}”. Use mm, cm, m, in or ft.`,
    };
  }

  const values: Partial<Record<MeasurementField, number>> = {};
  const explicitUnits: MeasurementUnit[] = [];
  const consumedRanges: MatchRange[] = [];
  let conflict: MeasurementField | undefined;
  let orderedTripleFound = false;

  const addValue = ({ field, valueMm, unit }: ParsedValue): void => {
    if (unit !== undefined) {
      explicitUnits.push(unit);
    }
    const existing = values[field];
    if (existing !== undefined && existing !== valueMm) {
      conflict = field;
      return;
    }
    values[field] = valueMm;
  };

  for (const match of normalized.matchAll(ORDERED_TRIPLE_PATTERN)) {
    if (match.index === undefined || match.groups === undefined) continue;
    const range = { start: match.index, end: match.index + match[0].length };
    if (consumedRanges.some((candidate) => rangesOverlap(candidate, range))) continue;

    orderedTripleFound = true;
    consumedRanges.push(range);
    const trailingUnit = parseUnit(match.groups.thirdUnit);
    const fields = ["width", "height", "depth"] as const;
    const rawValues = [match.groups.first, match.groups.second, match.groups.third] as const;
    const rawUnits = [match.groups.firstUnit, match.groups.secondUnit, match.groups.thirdUnit] as const;

    fields.forEach((field, index) => {
      const explicitUnit = parseUnit(rawUnits[index]);
      const unit = explicitUnit ?? trailingUnit ?? selectedUnit;
      addValue({
        field,
        valueMm: toMillimetres(Number(rawValues[index]), unit),
        unit: explicitUnit ?? (trailingUnit !== undefined ? trailingUnit : undefined),
      });
    });
  }

  collectLabelledValues(
    normalized,
    LABEL_BEFORE_PATTERN,
    selectedUnit,
    consumedRanges,
    addValue,
  );
  collectLabelledValues(
    normalized,
    LABEL_AFTER_PATTERN,
    selectedUnit,
    consumedRanges,
    addValue,
  );

  if (conflict !== undefined) {
    return {
      status: "invalid",
      message: `Conflicting ${fieldLabel(conflict)} values were provided.`,
    };
  }

  const unlabelledNumbers = [...normalized.matchAll(NUMBER_PATTERN)].filter((match) => {
    if (match.index === undefined) return false;
    const range = { start: match.index, end: match.index + match[0].length };
    return !consumedRanges.some((candidate) => rangesOverlap(candidate, range));
  });
  if (unlabelledNumbers.length > 0) {
    return {
      status: "invalid",
      message: orderedTripleFound
        ? "Label the doorway value explicitly; a fourth unlabelled number is not treated as access."
        : "Label each value as width, height, depth or doorway.",
    };
  }

  if (Object.keys(values).length === 0) {
    return {
      status: "invalid",
      message: "Enter measurements such as 90 cm wide, 180 high and 35 deep.",
    };
  }

  for (const field of MEASUREMENT_FIELDS) {
    const valueMm = values[field];
    if (valueMm === undefined) continue;
    const rangeError = validateRange(field, valueMm);
    if (rangeError !== undefined) {
      return { status: "invalid", message: rangeError };
    }
  }

  const missing = REQUIRED_FIELDS.filter((field) => values[field] === undefined);
  if (missing.length > 0) {
    return {
      status: "incomplete",
      values,
      missing,
    };
  }

  const baseMeasurement = manualSpaceMeasurement(
    {
      widthMm: values.width as number,
      heightMm: values.height as number,
      depthMm: values.depth as number,
    },
    MANUAL_BASE_UNCERTAINTY_MM,
  );
  const measurement = values.access === undefined
    ? baseMeasurement
    : { ...baseMeasurement, accessWidthMm: values.access };

  return {
    status: "complete",
    measurement,
    detectedUnit: detectedUnit(explicitUnits, selectedUnit),
  };
}

function collectLabelledValues(
  input: string,
  pattern: RegExp,
  selectedUnit: MeasurementUnit,
  consumedRanges: MatchRange[],
  addValue: (value: ParsedValue) => void,
): void {
  pattern.lastIndex = 0;
  for (const match of input.matchAll(pattern)) {
    if (match.index === undefined || match.groups === undefined) continue;
    const range = { start: match.index, end: match.index + match[0].length };
    if (consumedRanges.some((candidate) => rangesOverlap(candidate, range))) continue;

    const field = parseField(match.groups.label);
    if (field === undefined) continue;
    const explicitUnit = parseUnit(match.groups.unit);
    const unit = explicitUnit ?? selectedUnit;
    consumedRanges.push(range);
    addValue({
      field,
      valueMm: toMillimetres(Number(match.groups.value), unit),
      unit: explicitUnit,
    });
  }
}

function parseField(input: string | undefined): MeasurementField | undefined {
  const normalized = input?.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === undefined) return undefined;
  if (["width", "wide", "w"].includes(normalized)) return "width";
  if (["height", "high", "h"].includes(normalized)) return "height";
  if (["depth", "deep", "d"].includes(normalized)) return "depth";
  if (
    [
      "access",
      "door",
      "doorway",
      "opening",
      "access opening",
      "narrowest opening",
      "narrowest access opening",
    ].includes(normalized)
  ) {
    return "access";
  }
  return undefined;
}

function parseUnit(input: string | undefined): MeasurementUnit | undefined {
  if (input === undefined) return undefined;
  const normalized = input.trim().toLowerCase();
  if (normalized === "mm" || normalized.startsWith("millimet")) return "mm";
  if (normalized === "cm" || normalized.startsWith("centimet")) return "cm";
  if (normalized === "m" || normalized.startsWith("met")) return "m";
  if (["in", "inch", "inches", '"', "″"].includes(normalized)) return "in";
  if (["ft", "foot", "feet", "'", "′"].includes(normalized)) return "ft";
  return undefined;
}

function toMillimetres(value: number, unit: MeasurementUnit): number {
  const multiplier: Record<MeasurementUnit, number> = {
    mm: 1,
    cm: 10,
    m: 1000,
    in: 25.4,
    ft: 304.8,
  };
  return Math.round(value * multiplier[unit]);
}

function validateRange(field: MeasurementField, valueMm: number): string | undefined {
  if (!Number.isFinite(valueMm)) {
    return `${fieldLabel(field)} must be a finite number.`;
  }
  const minimum = field === "access" ? 300 : 100;
  const maximum = field === "access" ? 3000 : 10_000;
  if (valueMm < minimum || valueMm > maximum) {
    return `${fieldLabel(field)} must be between ${formatMm(minimum)} and ${formatMm(maximum)} mm.`;
  }
  return undefined;
}

function findUnsupportedUnit(input: string): string | undefined {
  NUMBER_WITH_WORD_PATTERN.lastIndex = 0;
  for (const match of input.matchAll(NUMBER_WITH_WORD_PATTERN)) {
    const token = match[2]?.toLowerCase();
    if (token === undefined) continue;
    if (parseUnit(token) !== undefined || parseField(token) !== undefined) continue;
    if (token === "x" || token === "by") continue;
    return match[2];
  }
  return undefined;
}

function detectedUnit(
  explicitUnits: readonly MeasurementUnit[],
  selectedUnit: MeasurementUnit,
): MeasurementUnit {
  const unique = [...new Set(explicitUnits)];
  return unique.length === 1 ? unique[0] : selectedUnit;
}

function rangesOverlap(a: MatchRange, b: MatchRange): boolean {
  return a.start < b.end && b.start < a.end;
}

function fieldLabel(field: MeasurementField): string {
  if (field === "access") return "Doorway";
  return `${field[0].toUpperCase()}${field.slice(1)}`;
}

function formatMm(value: number): string {
  return new Intl.NumberFormat("en-AU").format(value);
}
