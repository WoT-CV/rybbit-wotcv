export const MIN_INACTIVITY_FAST_FORWARD_DURATION_MS = 3_000;

export const INACTIVITY_FAST_FORWARD_SPEEDS = [5, 10, 15, 20, 25, 50] as const;
export type InactivityFastForwardSpeed = (typeof INACTIVITY_FAST_FORWARD_SPEEDS)[number];
export const DEFAULT_INACTIVITY_FAST_FORWARD_SPEED: InactivityFastForwardSpeed = 25;

export function shouldFastForwardInactivity(segmentDurationMs: number): boolean {
  return Number.isFinite(segmentDurationMs) && segmentDurationMs >= MIN_INACTIVITY_FAST_FORWARD_DURATION_MS;
}

export function isInactivityFastForwardSpeed(speed: number): speed is InactivityFastForwardSpeed {
  return INACTIVITY_FAST_FORWARD_SPEEDS.some(option => option === speed);
}

export function getInactivityFastForwardSpeed(
  segmentDurationMs: number,
  selectedSpeed: number,
  selectedInactivitySpeed: number
): number {
  const safeSelectedSpeed = Number.isFinite(selectedSpeed) && selectedSpeed > 0 ? selectedSpeed : 1;
  if (!shouldFastForwardInactivity(segmentDurationMs)) return safeSelectedSpeed;

  const safeInactivitySpeed = isInactivityFastForwardSpeed(selectedInactivitySpeed)
    ? selectedInactivitySpeed
    : DEFAULT_INACTIVITY_FAST_FORWARD_SPEED;

  return Math.max(safeSelectedSpeed, safeInactivitySpeed);
}
