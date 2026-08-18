import { describe, expect, it, vi } from "vitest";
import {
  clearPendingMeasurementReviewDraft,
  createPendingMeasurementReviewDraft,
  PENDING_MEASUREMENT_REVIEW_KEY,
  persistPendingMeasurementReviewDraft,
  readPendingMeasurementReviewDraft,
} from "./pending-measurement-review";
import type { MeasurementReviewStorage } from "./pending-measurement-review";

describe("pending measurement review storage", () => {
  it("round-trips a versioned normalized draft", () => {
    const storage = memoryStorage();
    const draft = createPendingMeasurementReviewDraft(
      {
        widthMm: 900,
        heightMm: 1800,
        depthMm: 350,
        accessWidthMm: 820,
        uncertaintyMm: 25,
        source: "manual",
      },
      "cm",
      "space-1",
    );

    expect(persistPendingMeasurementReviewDraft(storage, draft)).toBe(true);
    expect(readPendingMeasurementReviewDraft(storage)).toEqual(draft);
    expect(JSON.parse(storage.getItem(PENDING_MEASUREMENT_REVIEW_KEY) ?? "{}")).toEqual({
      version: 1,
      measurement: {
        widthMm: 900,
        heightMm: 1800,
        depthMm: 350,
        accessWidthMm: 820,
        uncertaintyMm: 25,
        source: "manual",
      },
      selectedUnit: "cm",
      editingSpaceId: "space-1",
    });
  });

  it("keeps delivery access optional without inventing a value", () => {
    const storage = memoryStorage();
    const draft = createPendingMeasurementReviewDraft(
      {
        widthMm: 900,
        heightMm: 1800,
        depthMm: 350,
        uncertaintyMm: 25,
        source: "manual",
      },
      "mm",
    );

    persistPendingMeasurementReviewDraft(storage, draft);

    expect(readPendingMeasurementReviewDraft(storage)).toEqual({
      version: 1,
      measurement: {
        widthMm: 900,
        heightMm: 1800,
        depthMm: 350,
        uncertaintyMm: 25,
        source: "manual",
      },
      selectedUnit: "mm",
    });
  });

  it.each([
    {
      version: 2,
      measurement: validMeasurement(),
      selectedUnit: "cm",
    },
    {
      version: 1,
      measurement: { ...validMeasurement(), widthMm: 99 },
      selectedUnit: "cm",
    },
    {
      version: 1,
      measurement: { ...validMeasurement(), accessWidthMm: 3001 },
      selectedUnit: "cm",
    },
    {
      version: 1,
      measurement: { ...validMeasurement(), widthMm: 900.5 },
      selectedUnit: "cm",
    },
    {
      version: 1,
      measurement: { ...validMeasurement(), unknown: 1 },
      selectedUnit: "cm",
    },
    {
      version: 1,
      measurement: validMeasurement(),
      selectedUnit: "yd",
    },
    {
      version: 1,
      measurement: validMeasurement(),
      selectedUnit: "cm",
      editingSpaceId: "",
    },
    {
      version: 1,
      measurement: validMeasurement(),
      selectedUnit: "cm",
      unexpected: true,
    },
  ])("rejects and removes an invalid stored draft", (stored) => {
    const storage = memoryStorage();
    storage.setItem(PENDING_MEASUREMENT_REVIEW_KEY, JSON.stringify(stored));

    expect(readPendingMeasurementReviewDraft(storage)).toBeUndefined();
    expect(storage.getItem(PENDING_MEASUREMENT_REVIEW_KEY)).toBeNull();
  });

  it("degrades safely when session storage is unavailable", () => {
    const storage: MeasurementReviewStorage = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      removeItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };
    const draft = createPendingMeasurementReviewDraft(validMeasurement(), "cm");

    expect(persistPendingMeasurementReviewDraft(storage, draft)).toBe(false);
    expect(readPendingMeasurementReviewDraft(storage)).toBeUndefined();
    expect(() => clearPendingMeasurementReviewDraft(storage)).not.toThrow();
  });

  it("clears the handoff after review completion", () => {
    const storage = memoryStorage();
    persistPendingMeasurementReviewDraft(
      storage,
      createPendingMeasurementReviewDraft(validMeasurement(), "cm"),
    );

    clearPendingMeasurementReviewDraft(storage);

    expect(readPendingMeasurementReviewDraft(storage)).toBeUndefined();
  });
});

function memoryStorage(): MeasurementReviewStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function validMeasurement() {
  return {
    widthMm: 900,
    heightMm: 1800,
    depthMm: 350,
    uncertaintyMm: 25,
    source: "manual" as const,
  };
}
