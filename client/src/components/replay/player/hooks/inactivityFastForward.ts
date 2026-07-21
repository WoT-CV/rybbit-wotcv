export const MIN_INACTIVITY_FAST_FORWARD_DURATION_MS = 3_000;

const MIN_INACTIVITY_FAST_FORWARD_SPEED = 2;
const MAX_INACTIVITY_FAST_FORWARD_SPEED = 8;
const TARGET_INACTIVITY_FAST_FORWARD_DURATION_MS = 2_500;

export function shouldFastForwardInactivity(segmentDurationMs: number): boolean {
  return Number.isFinite(segmentDurationMs) && segmentDurationMs >= MIN_INACTIVITY_FAST_FORWARD_DURATION_MS;
}

export function getInactivityFastForwardSpeed(segmentDurationMs: number, selectedSpeed: number): number {
  const safeSelectedSpeed = Number.isFinite(selectedSpeed) && selectedSpeed > 0 ? selectedSpeed : 1;
  if (!shouldFastForwardInactivity(segmentDurationMs)) return safeSelectedSpeed;

  const adaptiveSpeed = Math.min(
    MAX_INACTIVITY_FAST_FORWARD_SPEED,
    Math.max(MIN_INACTIVITY_FAST_FORWARD_SPEED, segmentDurationMs / TARGET_INACTIVITY_FAST_FORWARD_DURATION_MS)
  );

  return Math.max(safeSelectedSpeed, Math.round(adaptiveSpeed * 10) / 10);
}
