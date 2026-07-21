import { describe, expect, it } from "vitest";

import {
  DEFAULT_INACTIVITY_FAST_FORWARD_SPEED,
  getInactivityFastForwardSpeed,
  INACTIVITY_FAST_FORWARD_SPEEDS,
  MIN_INACTIVITY_FAST_FORWARD_DURATION_MS,
  shouldFastForwardInactivity,
} from "./inactivityFastForward";

describe("inactivity fast-forward", () => {
  it("offers the configured inactivity speeds", () => {
    expect(INACTIVITY_FAST_FORWARD_SPEEDS).toEqual([5, 10, 15, 20, 25, 50]);
    expect(DEFAULT_INACTIVITY_FAST_FORWARD_SPEED).toBe(25);
  });

  it("leaves short inactive periods at the selected speed", () => {
    expect(shouldFastForwardInactivity(MIN_INACTIVITY_FAST_FORWARD_DURATION_MS - 1)).toBe(false);
    expect(getInactivityFastForwardSpeed(2_999, 1, 25)).toBe(1);
  });

  it("uses the inactivity speed selected by the viewer", () => {
    expect(shouldFastForwardInactivity(MIN_INACTIVITY_FAST_FORWARD_DURATION_MS)).toBe(true);
    expect(getInactivityFastForwardSpeed(3_000, 1, 5)).toBe(5);
    expect(getInactivityFastForwardSpeed(5 * 60_000, 1, 50)).toBe(50);
  });

  it("never slows down a speed selected by the viewer", () => {
    expect(getInactivityFastForwardSpeed(10_000, 60, 50)).toBe(60);
  });

  it("falls back safely for invalid values", () => {
    expect(shouldFastForwardInactivity(Number.NaN)).toBe(false);
    expect(getInactivityFastForwardSpeed(Number.NaN, Number.NaN, Number.NaN)).toBe(1);
    expect(getInactivityFastForwardSpeed(10_000, 1, Number.NaN)).toBe(DEFAULT_INACTIVITY_FAST_FORWARD_SPEED);
  });
});
