import wordsJson from "@/data/words.json";

export type WordDifficulty = 1 | 2 | 3;

export interface WordEntry {
  hebrew: string;
  translit: string;
  english: string[];
  difficulty: WordDifficulty;
  level: number;
  pos?:
    | "noun"
    | "verb"
    | "adj"
    | "adv"
    | "prep"
    | "pron"
    | "other";
}

import { loadOverrides } from "@/lib/word-overrides";

export const bundledWords: WordEntry[] = wordsJson as WordEntry[];
export const words = bundledWords;

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function getWordsForLevel(level: number): WordEntry[] {
  return bundledWords.filter((w) => w.level === level);
}

/**
 * Returns the *effective* word list for a level, merging bundled words with
 * the user's localStorage overrides (hidden bundles + custom additions).
 * Safe to call on the server (returns bundled-only when `window` is missing).
 */
export function getEffectiveWordsForLevel(level: number): WordEntry[] {
  const overrides = loadOverrides();
  const hidden = new Set(overrides.hiddenBundleHebrew);
  const bundled = bundledWords.filter(
    (w) => w.level === level && !hidden.has(w.hebrew),
  );
  const custom = overrides.customWords.filter((w) => w.level === level);
  return [...bundled, ...custom];
}

export function getAllEffectiveWords(): WordEntry[] {
  const overrides = loadOverrides();
  const hidden = new Set(overrides.hiddenBundleHebrew);
  const bundled = bundledWords.filter((w) => !hidden.has(w.hebrew));
  return [...bundled, ...overrides.customWords];
}

/** First English gloss — used as a hint after answering. */
export function getPrimaryEnglish(entry: WordEntry): string {
  return entry.english[0] ?? "";
}

/** Transliteration shown as an answer choice. */
export function getAnswerLabel(entry: WordEntry): string {
  return entry.translit;
}

/** Unique key for deduping rounds (hebrew string is unique enough). */
export function wordKey(entry: WordEntry): string {
  return `${entry.level}:${entry.hebrew}`;
}

export interface AnswerOption {
  id: string;
  label: string;
  isCorrect: boolean;
  entry: WordEntry;
}

/**
 * Builds 4 shuffled choices: one correct word + 3 distractors from the same level.
 */
export function buildRoundOptions(
  correct: WordEntry,
  pool: WordEntry[],
): AnswerOption[] {
  // Distractors must have a *different* transliteration so the round is
  // unambiguous (some entries share translits e.g. רוּחַ / both spellings).
  const others = pool.filter(
    (w) => w.hebrew !== correct.hebrew && w.translit !== correct.translit,
  );
  const picks = shuffle(others).slice(0, 3);
  while (picks.length < 3 && others.length > picks.length) {
    const extra = others.find((o) => !picks.includes(o));
    if (!extra) break;
    picks.push(extra);
  }
  const options: AnswerOption[] = [correct, ...picks].map((entry) => ({
    id: wordKey(entry),
    label: getAnswerLabel(entry),
    isCorrect: entry.hebrew === correct.hebrew,
    entry,
  }));
  return shuffle(options);
}

export function pickRandomWord(
  pool: WordEntry[],
  avoidKeys: Set<string>,
): WordEntry | null {
  const candidates = pool.filter((w) => !avoidKeys.has(wordKey(w)));
  const list = candidates.length > 0 ? candidates : pool;
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)] ?? null;
}
