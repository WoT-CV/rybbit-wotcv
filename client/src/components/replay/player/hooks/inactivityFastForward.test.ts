import { describe, expect, it } from "vitest";

import {
  getInactivityFastForwardSpeed,
  MIN_INACTIVITY_FAST_FORWARD_DURATION_MS,
  shouldFastForwardInactivity,
} from "./inactivityFastForward";

describe("inactivity fast-forward", () => {
  it("leaves short inactive periods at the selected speed", () => {
    expect(shouldFastForwardInactivity(MIN_INACTIVITY_FAST_FORWARD_DURATION_MS - 1)).toBe(false);
    expect(getInactivityFastForwardSpeed(2_999, 1)).toBe(1);
  });

  it("keeps the transition into fast-forward visible", () => {
    expect(shouldFastForwardInactivity(MIN_INACTIVITY_FAST_FORWARD_DURATION_MS)).toBe(true);
    expect(getInactivityFastForwardSpeed(3_000, 1)).toBe(2);
    expect(getInactivityFastForwardSpeed(10_000, 1)).toBe(4);
  });

  it("caps long inactive periods at a readable speed", () => {
    expect(getInactivityFastForwardSpeed(30_000, 1)).toBe(8);
    expect(getInactivityFastForwardSpeed(5 * 60_000, 1)).toBe(8);
  });

  it("never slows down a speed selected by the viewer", () => {
    expect(getInactivityFastForwardSpeed(10_000, 6)).toBe(6);
  });

  it("falls back safely for invalid values", () => {
    expect(shouldFastForwardInactivity(Number.NaN)).toBe(false);
    expect(getInactivityFastForwardSpeed(Number.NaN, Number.NaN)).toBe(1);
  });
});
