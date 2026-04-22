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
  /** Only present for the correct option (real word). Distractors are made-up. */
  entry?: WordEntry;
}

/**
 * Tokenize a transliteration so multi-letter Hebrew sounds (sh, ch, tz, kh, ts)
 * stay together. Splits the rest into single chars (vowels, consonants,
 * apostrophes, spaces, etc.).
 */
const TRANSLIT_TOKEN_RE = /sh|ch|tz|kh|ts|[a-zA-Z']|[^a-zA-Z']/g;
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

const VOWEL_SWAPS: Record<string, string[]> = {
  a: ["e", "o", "i"],
  e: ["a", "i"],
  i: ["e", "a"],
  o: ["u", "a"],
  u: ["o", "i"],
};

const CONSONANT_SWAPS: Record<string, string[]> = {
  b: ["v", "p"],
  v: ["b", "f"],
  p: ["f", "b"],
  f: ["p", "v"],
  t: ["d"],
  d: ["t"],
  k: ["g", "ch"],
  g: ["k"],
  ch: ["k", "h"],
  sh: ["s", "z"],
  s: ["sh", "z"],
  z: ["s", "tz"],
  tz: ["z", "s"],
  ts: ["z", "s"],
  m: ["n"],
  n: ["m"],
  r: ["l"],
  l: ["r"],
  y: ["i"],
  h: [""],
};

function tokenize(translit: string): string[] {
  return translit.match(TRANSLIT_TOKEN_RE) ?? [];
}

function pickRandom<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Returns a single-edit phonetic mutation of the input (or null if no token
 * can be mutated). Mutates exactly one token: a vowel or a consonant atom
 * (single chars or 'sh' / 'ch' / 'tz' / 'ts' / 'kh' digraphs).
 */
function mutateTranslit(translit: string): string | null {
  const tokens = tokenize(translit);
  if (tokens.length === 0) return null;
  const indices = tokens.map((_, i) => i);
  for (let attempt = 0; attempt < indices.length * 2; attempt++) {
    const idx = pickRandom(indices);
    if (idx == null) break;
    const tok = tokens[idx]!.toLowerCase();
    const candidates = VOWELS.has(tok)
      ? VOWEL_SWAPS[tok]
      : CONSONANT_SWAPS[tok];
    if (!candidates || candidates.length === 0) continue;
    const replacement = pickRandom(candidates);
    if (replacement == null) continue;
    const next = [...tokens];
    next[idx] = replacement;
    const out = next.join("");
    if (out && out !== translit) return out;
  }
  return null;
}

/**
 * Build N unique fake transliterations that look phonetically similar to the
 * original. Each distractor is made by mutating 1–2 sound atoms.
 */
function generateSimilarDistractors(
  correctTranslit: string,
  count: number,
  exclude: Set<string>,
): string[] {
  const out: string[] = [];
  const seen = new Set(exclude);
  seen.add(correctTranslit.toLowerCase());

  const maxAttempts = count * 25;
  for (let attempt = 0; attempt < maxAttempts && out.length < count; attempt++) {
    let candidate = mutateTranslit(correctTranslit);
    if (!candidate) break;
    // For longer words, sometimes apply a second mutation for more variety.
    if (correctTranslit.replace(/[^a-zA-Z]/g, "").length > 4 && Math.random() < 0.5) {
      candidate = mutateTranslit(candidate) ?? candidate;
    }
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

/**
 * Builds 4 shuffled choices: one correct transliteration + 3 phonetically
 * similar (but made-up) distractors. Falls back to other-pool words only if
 * mutation cannot produce enough unique distractors.
 */
export function buildRoundOptions(
  correct: WordEntry,
  pool: WordEntry[],
): AnswerOption[] {
  const exclude = new Set<string>();
  for (const w of pool) exclude.add(w.translit.toLowerCase());

  const distractors = generateSimilarDistractors(correct.translit, 3, exclude);

  if (distractors.length < 3) {
    // Last-ditch fallback: pull other real translits from the level pool.
    const others = pool.filter(
      (w) =>
        w.hebrew !== correct.hebrew &&
        w.translit.toLowerCase() !== correct.translit.toLowerCase(),
    );
    for (const o of shuffle(others)) {
      if (distractors.length >= 3) break;
      const key = o.translit.toLowerCase();
      if (distractors.some((d) => d.toLowerCase() === key)) continue;
      distractors.push(o.translit);
    }
  }

  const correctOption: AnswerOption = {
    id: `correct:${wordKey(correct)}`,
    label: getAnswerLabel(correct),
    isCorrect: true,
    entry: correct,
  };
  const distractorOptions: AnswerOption[] = distractors
    .slice(0, 3)
    .map((label, i) => ({
      id: `fake:${i}:${label}`,
      label,
      isCorrect: false,
    }));

  return shuffle([correctOption, ...distractorOptions]);
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
