import { describe, expect, it } from "vitest";
import { formatObservedDate } from "./presentation";

describe("journey presentation", () => {
  it("formats observation dates identically across server and mobile browsers", () => {
    expect(formatObservedDate("2026-07-25T23:30:00.000Z")).toBe("25 Jul 2026");
    expect(formatObservedDate("not-a-date")).toBe("Date unavailable");
  });
});
