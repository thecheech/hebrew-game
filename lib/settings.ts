import { getDefaultTimerSeconds } from "@/lib/levels";

const SETTINGS_KEY = "hebrew-game-settings";

export interface GameSettings {
  /** If set, overrides per-level default timer (seconds). */
  timerSecondsOverride: number | null;
}

const defaultSettings: GameSettings = {
  timerSecondsOverride: null,
};

/** Timer shown in UI and used when starting rounds (3–60 clamp). */
export function getEffectiveTimerSeconds(level: number): number {
  const s = loadSettings();
  if (
    s.timerSecondsOverride != null &&
    s.timerSecondsOverride >= 3 &&
    s.timerSecondsOverride <= 60
  ) {
    return s.timerSecondsOverride;
  }
  return getDefaultTimerSeconds(level);
}

export function loadSettings(): GameSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(partial: Partial<GameSettings>): GameSettings {
  const next = { ...loadSettings(), ...partial };
  if (typeof window !== "undefined") {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }
  return next;
}
