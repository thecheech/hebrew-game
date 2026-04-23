import { getDefaultTimerSeconds, type LevelId } from "@/lib/levels";

const SETTINGS_KEY = "hebrew-game-settings";

/** Allowed range when the student enables a custom timer (seconds per word). */
export const TIMER_OVERRIDE_MIN = 15;
export const TIMER_OVERRIDE_MAX = 60;

export interface GameSettings {
  /** If set, overrides per-level default timer (seconds). */
  timerSecondsOverride: number | null;
  /**
   * When true (default), the next round starts automatically ~1s after a
   * choice is made. When false, the user must press a key/click to advance,
   * giving them time to study the revealed translation + meaning.
   */
  autoAdvance: boolean;
}

const defaultSettings: GameSettings = {
  timerSecondsOverride: null,
  autoAdvance: true,
};

/** Timer shown in UI and used when starting rounds. */
export function getEffectiveTimerSeconds(level: LevelId): number {
  const s = loadSettings();
  if (
    s.timerSecondsOverride != null &&
    Number.isFinite(s.timerSecondsOverride) &&
    s.timerSecondsOverride >= TIMER_OVERRIDE_MIN &&
    s.timerSecondsOverride <= TIMER_OVERRIDE_MAX
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
    window.dispatchEvent(new Event(SETTINGS_EVENT));
  }
  return next;
}

const SETTINGS_EVENT = "hebrew-game-settings-changed";

export function subscribeSettings(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => onChange();
  window.addEventListener("storage", handler);
  window.addEventListener(SETTINGS_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(SETTINGS_EVENT, handler);
  };
}
