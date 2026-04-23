import wordsJson from "@/data/words.json";

export const MAX_ROUNDS_PER_LEVEL = 25;

interface RawWord {
  level: number | string;
}
const allRawWords = wordsJson as RawWord[];

/**
 * A level identifier — either a numeric core level (1, 2, ...) or a string id
 * for a named extra level (e.g. a sub-bucket like `10a` or a Torah-portion
 * vocabulary set like `miketz-1a`).
 */
export type LevelId = number | string;

export interface ExtraLevel {
  /** URL-safe id, also used as `WordEntry.level` for entries in this set. */
  id: string;
  /** Short label shown on the level button. */
  label: string;
  /** Sub-label / category. */
  category: string;
  /** Default round timer (seconds) for this level. */
  timerSeconds: number;
}

/**
 * Hand-curated extra levels (Torah portions, etc.).
 *
 * The actual list of *playable* levels is derived from word data — see
 * `getAllLevelIds()`. This array contributes display metadata for ids that
 * begin with the registered `id` prefix.
 */
export const EXTRA_LEVELS: ExtraLevel[] = [
  {
    id: "miketz-1",
    label: "Miketz-1",
    category: "Torah portion",
    timerSeconds: 12,
  },
  {
    id: "miketz-2",
    label: "Miketz-2",
    category: "Torah portion",
    timerSeconds: 12,
  },
];

const EXTRA_LEVEL_MAP: Record<string, ExtraLevel> = Object.fromEntries(
  EXTRA_LEVELS.map((l) => [l.id, l]),
);

export function getExtraLevel(id: string): ExtraLevel | undefined {
  if (EXTRA_LEVEL_MAP[id]) return EXTRA_LEVEL_MAP[id];
  // Match longest registered prefix (e.g. "miketz-1-a" matches "miketz-1").
  let bestKey: string | null = null;
  for (const key of Object.keys(EXTRA_LEVEL_MAP)) {
    if (id.startsWith(`${key}-`) || id.startsWith(key)) {
      if (!bestKey || key.length > bestKey.length) bestKey = key;
    }
  }
  return bestKey ? EXTRA_LEVEL_MAP[bestKey] : undefined;
}

export function isExtraLevel(level: LevelId): level is string {
  return typeof level === "string";
}

/** String form used for storage keys and equality. */
export function levelKey(level: LevelId): string {
  return String(level);
}

/**
 * Distinct level ids found in the bundled word data, in display order.
 * Numeric-prefixed ids come first (sorted naturally: 1, 2, ..., 10a, 10b),
 * followed by named extra-level groups in their original `EXTRA_LEVELS` order.
 */
export function getAllLevelIds(): LevelId[] {
  const seen = new Map<string, LevelId>();
  for (const w of allRawWords) {
    const k = levelKey(w.level);
    if (!seen.has(k)) seen.set(k, w.level);
  }

  const numericFirst: LevelId[] = [];
  const extras: LevelId[] = [];
  for (const [k, level] of seen) {
    if (/^\d/.test(k)) numericFirst.push(level);
    else extras.push(level);
  }

  numericFirst.sort((a, b) =>
    levelKey(a).localeCompare(levelKey(b), "en", { numeric: true }),
  );

  // Order extras by EXTRA_LEVELS prefix order, then alphabetically within.
  extras.sort((a, b) => {
    const ea = getExtraLevel(levelKey(a))?.id ?? levelKey(a);
    const eb = getExtraLevel(levelKey(b))?.id ?? levelKey(b);
    const ai = EXTRA_LEVELS.findIndex((x) => x.id === ea);
    const bi = EXTRA_LEVELS.findIndex((x) => x.id === eb);
    if (ai !== bi) return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    return levelKey(a).localeCompare(levelKey(b), "en", { numeric: true });
  });

  return [...numericFirst, ...extras];
}

/** Number of words (and therefore unique rounds) bundled for `level`. */
export function getRoundsForLevel(level: LevelId): number {
  const k = levelKey(level);
  let n = 0;
  for (const w of allRawWords) if (levelKey(w.level) === k) n++;
  return Math.min(n, MAX_ROUNDS_PER_LEVEL);
}

/**
 * Highest numeric "core" level present in the data (e.g. for "20b" → 20).
 * Used by older code paths that clamp user input to the valid range.
 */
export function getMaxCoreLevel(): number {
  let max = 1;
  for (const w of allRawWords) {
    const k = levelKey(w.level);
    const m = /^(\d+)/.exec(k);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return max;
}

/** Default countdown seconds for a level (user can override in settings). */
export function getDefaultTimerSeconds(level: LevelId): number {
  if (typeof level === "string" && !/^\d/.test(level)) {
    return getExtraLevel(level)?.timerSeconds ?? 10;
  }
  const m = /^(\d+)/.exec(levelKey(level));
  const n = m ? Number(m[1]) : 1;
  const max = getMaxCoreLevel();
  const clamped = Math.min(Math.max(n, 1), max);
  // L1 ≈ 15s → Lmax ≈ 6s
  return Math.round(15 - ((clamped - 1) / Math.max(1, max - 1)) * 9);
}

export function getLevelLabel(level: LevelId): string {
  const k = levelKey(level);
  if (typeof level === "string" && !/^\d/.test(k)) {
    return getExtraLevel(k)?.category ?? "Custom";
  }
  const m = /^(\d+)/.exec(k);
  const n = m ? Number(m[1]) : 1;
  if (n <= 7) return "Beginner";
  if (n <= 14) return "Intermediate";
  return "Advanced";
}

export function getLevelTitle(level: LevelId): string {
  const k = levelKey(level);
  if (typeof level === "string" && !/^\d/.test(k)) {
    const meta = getExtraLevel(k);
    if (!meta) return k;
    if (k === meta.id) return meta.label;
    // Suffixed extras (e.g. "miketz-1b-a") — show the suffix after the label.
    const tail = k.slice(meta.id.length).replace(/^-/, "");
    return tail ? `${meta.label} ${tail}` : meta.label;
  }
  return `Level ${k}`;
}

export function describeLevel(level: LevelId): string {
  return `${getLevelTitle(level)} — ${getLevelLabel(level)}`;
}
