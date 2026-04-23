import { create } from "zustand";

import { saveBestScore } from "@/lib/best-score";
import {
  buildRoundOptions,
  getEffectiveWordsForLevel,
  pickRandomWord,
  wordKey,
  type AnswerOption,
  type WordEntry,
} from "@/lib/words";
import { getRoundsForLevel, type LevelId } from "@/lib/levels";
import { getEffectiveTimerSeconds } from "@/lib/settings";

export type GamePhase = "idle" | "playing" | "feedback" | "summary";

export interface FeedbackState {
  correct: boolean;
  chosenIndex: number | null;
  pointsAwarded: number;
}

interface GameState {
  level: LevelId;
  roundIndex: number;
  score: number;
  correctCount: number;
  phase: GamePhase;
  currentWord: WordEntry | null;
  options: AnswerOption[];
  feedback: FeedbackState | null;
  timerMsRemaining: number;
  timerTotalMs: number;
  usedWordKeys: string[];
  startSession: (level: LevelId) => void;
  tick: (deltaMs: number) => void;
  submitAnswer: (optionIndex: number) => void;
  clearFeedbackAndAdvance: () => void;
  resetIdle: () => void;
}

function drawRound(level: LevelId, used: Set<string>) {
  const pool = getEffectiveWordsForLevel(level);
  const word = pickRandomWord(pool, used);
  if (!word) {
    return {
      currentWord: null as WordEntry | null,
      options: [] as AnswerOption[],
    };
  }
  used.add(wordKey(word));
  const options = buildRoundOptions(word, pool);
  return { currentWord: word, options };
}

export const useGameStore = create<GameState>((set, get) => ({
  level: 1,
  roundIndex: 0,
  score: 0,
  correctCount: 0,
  phase: "idle",
  currentWord: null,
  options: [],
  feedback: null,
  timerMsRemaining: 0,
  timerTotalMs: 0,
  usedWordKeys: [],

  resetIdle: () =>
    set({
      phase: "idle",
      currentWord: null,
      options: [],
      feedback: null,
      timerMsRemaining: 0,
      timerTotalMs: 0,
      usedWordKeys: [],
    }),

  startSession: (level) => {
    const used = new Set<string>();
    const { currentWord, options } = drawRound(level, used);
    const sec = getEffectiveTimerSeconds(level);
    const totalMs = sec * 1000;
    set({
      level,
      roundIndex: 0,
      score: 0,
      correctCount: 0,
      phase: currentWord ? "playing" : "summary",
      currentWord,
      options,
      feedback: null,
      timerMsRemaining: totalMs,
      timerTotalMs: totalMs,
      usedWordKeys: [...used],
    });
  },

  tick: (deltaMs) => {
    const { phase, timerMsRemaining, currentWord } = get();
    if (phase !== "playing") return;
    if (!Number.isFinite(timerMsRemaining)) return;
    const next = Math.max(0, timerMsRemaining - deltaMs);
    if (next <= 0 && currentWord) {
      set({
        timerMsRemaining: 0,
        phase: "feedback",
        feedback: {
          correct: false,
          chosenIndex: null,
          pointsAwarded: 0,
        },
      });
      return;
    }
    set({ timerMsRemaining: next });
  },

  submitAnswer: (optionIndex) => {
    const { phase, options, currentWord, score } = get();
    if (phase !== "playing" || !currentWord) return;
    const chosen = options[optionIndex];
    const correct = Boolean(chosen?.isCorrect);
    const points = correct ? currentWord.difficulty : 0;
    const prevCorrect = get().correctCount;
    set({
      phase: "feedback",
      feedback: {
        correct,
        chosenIndex: optionIndex,
        pointsAwarded: points,
      },
      score: score + points,
      correctCount: correct ? prevCorrect + 1 : prevCorrect,
      timerMsRemaining: 0,
    });
  },

  clearFeedbackAndAdvance: () => {
    const { level, roundIndex, score, usedWordKeys } = get();
    const used = new Set(usedWordKeys);
    const nextRound = roundIndex + 1;

    if (nextRound >= getRoundsForLevel(level)) {
      saveBestScore(level, score);
      set({
        phase: "summary",
        feedback: null,
        currentWord: null,
        options: [],
        roundIndex: nextRound,
      });
      return;
    }

    const { currentWord, options } = drawRound(level, used);
    const sec = getEffectiveTimerSeconds(level);
    const totalMs = sec * 1000;

    if (!currentWord) {
      saveBestScore(level, score);
      set({
        phase: "summary",
        feedback: null,
        currentWord: null,
        options: [],
        roundIndex: nextRound,
      });
      return;
    }

    set({
      roundIndex: nextRound,
      phase: "playing",
      currentWord,
      options,
      feedback: null,
      timerMsRemaining: totalMs,
      timerTotalMs: totalMs,
      usedWordKeys: [...used],
    });
  },
}));
