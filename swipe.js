export const DETAIL_SWIPE_MIN_DISTANCE_PX = 48;
export const DETAIL_SWIPE_MAX_DISTANCE_PX = 72;
export const DETAIL_SWIPE_AXIS_RATIO = 1.25;

export function detailSwipeDirection({ deltaX, deltaY, width }) {
  const horizontalDistance = Math.abs(deltaX);
  const verticalDistance = Math.abs(deltaY);
  const threshold = Math.min(
    DETAIL_SWIPE_MAX_DISTANCE_PX,
    Math.max(DETAIL_SWIPE_MIN_DISTANCE_PX, width * 0.15),
  );

  if (horizontalDistance < threshold || horizontalDistance <= verticalDistance * DETAIL_SWIPE_AXIS_RATIO) return 0;
  return deltaX < 0 ? 1 : -1;
}
