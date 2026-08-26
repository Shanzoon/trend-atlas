export const archiveTimeline = {
  gather: [0.06, 0.44],
  folders: [0.32, 0.62],
  handoff: [0.84, 0.98],
  identityExit: [0.16, 0.34],
  archiveEntry: [0.34, 0.52],
  titleHandoff: [0.90, 0.98],
  artExit: [0.14, 0.46],
  folderExit: [0.94, 1],
  allEntry: [0.48, 0.62],
  cueEntry: [0.72, 0.84],
};

export const systemsTimeline = {
  bridgeEntry: [0, 0.08],
  projectStarts: [0.08, 0.4, 0.68],
  contactEntry: [0.92, 0.98],
};

// Freeze a timeline at ordered key frames while preserving its original
// normalized pace between them.
export function progressWithHolds(offset, motionDistance, holds) {
  const motion = Math.max(1, motionDistance);
  const clampedOffset = Math.max(0, offset);
  let heldDistance = 0;

  for (const [holdProgress, holdDistance] of holds) {
    const progress = Math.min(1, Math.max(0, holdProgress));
    const hold = Math.max(0, holdDistance);
    const holdStart = motion * progress + heldDistance;

    if (clampedOffset <= holdStart) return Math.min(1, (clampedOffset - heldDistance) / motion);
    if (clampedOffset <= holdStart + hold) return progress;
    heldDistance += hold;
  }

  return Math.min(1, (clampedOffset - heldDistance) / motion);
}

// Freeze the story at a key frame for a physical scroll distance without
// changing its animation speed before or after that resting state.
export function progressWithHold(offset, motionDistance, holdProgress, holdDistance) {
  return progressWithHolds(offset, motionDistance, [[holdProgress, holdDistance]]);
}
