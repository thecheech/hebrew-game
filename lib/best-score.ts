import { levelKey, type LevelId } from "@/lib/levels";

const BEST_KEY = "hebrew-game-best";

export function loadBestScores(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

export function saveBestScore(level: LevelId, score: number): void {
  if (typeof window === "undefined") return;
  const all = loadBestScores();
  const key = levelKey(level);
  if (score > (all[key] ?? 0)) {
    all[key] = score;
    localStorage.setItem(BEST_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event("hebrew-game-best-changed"));
  }
}

export function getBestScore(level: LevelId): number {
  return loadBestScores()[levelKey(level)] ?? 0;
}

/**
 * Subscribe to best-score storage updates (same tab + other tabs).
 * For `useSyncExternalStore` — keeps SSR/hydration aligned when paired with
 * `getServerSnapshot: () => 0`.
 */
export function subscribeBestScoresChanged(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChange();
  window.addEventListener("storage", handler);
  window.addEventListener("hebrew-game-best-changed", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("hebrew-game-best-changed", handler);
  };
}
