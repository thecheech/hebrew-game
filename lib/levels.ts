export const LEVEL_COUNT = 20;
export const ROUNDS_PER_LEVEL = 10;

/** Default countdown seconds per level (user can override in settings). */
export function getDefaultTimerSeconds(level: number): number {
  const clamped = Math.min(Math.max(level, 1), LEVEL_COUNT);
  // L1 ≈ 15s → L20 ≈ 6s
  return Math.round(15 - ((clamped - 1) / (LEVEL_COUNT - 1)) * 9);
}

export function getLevelLabel(level: number): string {
  if (level <= 7) return "Beginner";
  if (level <= 14) return "Intermediate";
  return "Advanced";
}

export function describeLevel(level: number): string {
  return `Level ${level} — ${getLevelLabel(level)}`;
}
