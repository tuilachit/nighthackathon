import { describe, expect, it, vi } from "vitest";
import { DEMO_SPACE_MEASUREMENT } from "./fit-config";
import {
  createSavedSpace,
  loadSavedSpaces,
  persistSavedSpaces,
  renameSavedSpace,
  SAVED_SPACES_STORAGE_KEY,
} from "./saved-spaces";

describe("saved spaces", () => {
  it("creates and reloads valid spaces newest first", () => {
    const older = createSavedSpace("Bedroom alcove", DEMO_SPACE_MEASUREMENT, {
      id: "older",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    const newer = createSavedSpace("Hallway", DEMO_SPACE_MEASUREMENT, {
      id: "newer",
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    const storage = {
      getItem: vi.fn(() => JSON.stringify([older, newer])),
    };

    expect(loadSavedSpaces(storage).map((space) => space.id)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("drops malformed records instead of trusting localStorage", () => {
    const valid = createSavedSpace("My space", DEMO_SPACE_MEASUREMENT, {
      id: "valid",
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    const invalid = {
      ...valid,
      id: "invalid",
      measurement: { ...valid.measurement, widthMm: 0 },
    };
    const storage = {
      getItem: vi.fn(() => JSON.stringify([invalid, valid])),
    };

    expect(loadSavedSpaces(storage)).toEqual([valid]);
  });

  it("silently degrades when reads or writes are blocked", () => {
    const blockedRead = {
      getItem: vi.fn(() => {
        throw new DOMException("Blocked", "SecurityError");
      }),
    };
    const blockedWrite = {
      setItem: vi.fn(() => {
        throw new DOMException("Quota", "QuotaExceededError");
      }),
    };

    expect(loadSavedSpaces(blockedRead)).toEqual([]);
    expect(
      persistSavedSpaces(blockedWrite, [
        createSavedSpace("My space", DEMO_SPACE_MEASUREMENT),
      ]),
    ).toBe(false);
  });

  it("persists the versioned payload and normalizes names", () => {
    const storage = { setItem: vi.fn() };
    const space = createSavedSpace("   ", DEMO_SPACE_MEASUREMENT, {
      id: "space-1",
      createdAt: "2026-08-02T00:00:00.000Z",
    });

    expect(space.name).toBe("My space");
    expect(persistSavedSpaces(storage, [space])).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(
      SAVED_SPACES_STORAGE_KEY,
      JSON.stringify([space]),
    );
    expect(renameSavedSpace([space], "space-1", "  Hallway  ")[0]?.name).toBe(
      "Hallway",
    );
  });
});
