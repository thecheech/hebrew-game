import type { LevelId } from "@/lib/levels";
import type { WordEntry, WordDifficulty } from "@/lib/words";

const OVERRIDES_KEY = "hebrew-game-word-overrides";
const OVERRIDES_EVENT = "hebrew-game-words-changed";

export interface CustomWord extends WordEntry {
  /** Stable client-generated id (custom-only). */
  id: string;
}

export interface WordOverrides {
  /** Hebrew strings of bundled words to hide. */
  hiddenBundleHebrew: string[];
  /** User-created words. Edits to bundled words = hide bundle + add custom. */
  customWords: CustomWord[];
}

const EMPTY: WordOverrides = {
  hiddenBundleHebrew: [],
  customWords: [],
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function emit(): void {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(OVERRIDES_EVENT));
}

export function loadOverrides(): WordOverrides {
  if (!isBrowser()) return EMPTY;
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<WordOverrides>;
    return {
      hiddenBundleHebrew: Array.isArray(parsed.hiddenBundleHebrew)
        ? parsed.hiddenBundleHebrew.filter((x): x is string => typeof x === "string")
        : [],
      customWords: Array.isArray(parsed.customWords)
        ? parsed.customWords.filter(isValidCustomWord)
        : [],
    };
  } catch {
    return EMPTY;
  }
}

function isValidCustomWord(value: unknown): value is CustomWord {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.hebrew === "string" &&
    typeof v.translit === "string" &&
    Array.isArray(v.english) &&
    typeof v.difficulty === "number" &&
    (typeof v.level === "number" || typeof v.level === "string")
  );
}

function persist(next: WordOverrides): WordOverrides {
  if (!isBrowser()) return next;
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next));
  emit();
  return next;
}

export function subscribeOverrides(onChange: () => void): () => void {
  if (!isBrowser()) return () => undefined;
  const handler = () => onChange();
  window.addEventListener("storage", handler);
  window.addEventListener(OVERRIDES_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(OVERRIDES_EVENT, handler);
  };
}

function newId(): string {
  return `c_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export interface WordDraft {
  hebrew: string;
  translit: string;
  english: string[];
  difficulty: WordDifficulty;
  level: LevelId;
}

function normalizeDraft(draft: WordDraft): WordDraft {
  return {
    hebrew: draft.hebrew.trim(),
    translit: draft.translit.trim(),
    english: draft.english
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    difficulty: draft.difficulty,
    level: draft.level,
  };
}

export function addCustomWord(draft: WordDraft): WordOverrides {
  const next = loadOverrides();
  const word: CustomWord = { id: newId(), ...normalizeDraft(draft) };
  return persist({ ...next, customWords: [...next.customWords, word] });
}

export function updateCustomWord(id: string, draft: WordDraft): WordOverrides {
  const next = loadOverrides();
  const customWords = next.customWords.map((w) =>
    w.id === id ? { ...w, ...normalizeDraft(draft) } : w,
  );
  return persist({ ...next, customWords });
}

export function deleteCustomWord(id: string): WordOverrides {
  const next = loadOverrides();
  return persist({
    ...next,
    customWords: next.customWords.filter((w) => w.id !== id),
  });
}

export function hideBundledWord(hebrew: string): WordOverrides {
  const next = loadOverrides();
  if (next.hiddenBundleHebrew.includes(hebrew)) return next;
  return persist({
    ...next,
    hiddenBundleHebrew: [...next.hiddenBundleHebrew, hebrew],
  });
}

export function unhideBundledWord(hebrew: string): WordOverrides {
  const next = loadOverrides();
  return persist({
    ...next,
    hiddenBundleHebrew: next.hiddenBundleHebrew.filter((h) => h !== hebrew),
  });
}

/** Editing a bundled word = hide it + add a custom replacement. */
export function replaceBundledWord(
  originalHebrew: string,
  draft: WordDraft,
): WordOverrides {
  const next = loadOverrides();
  const word: CustomWord = { id: newId(), ...normalizeDraft(draft) };
  return persist({
    hiddenBundleHebrew: next.hiddenBundleHebrew.includes(originalHebrew)
      ? next.hiddenBundleHebrew
      : [...next.hiddenBundleHebrew, originalHebrew],
    customWords: [...next.customWords, word],
  });
}

export function resetAllOverrides(): WordOverrides {
  return persist(EMPTY);
}
