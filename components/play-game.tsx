"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { AnswerOptions } from "@/components/answer-options";
import { CheatsheetFab } from "@/components/cheatsheet";
import { LevelPicker } from "@/components/level-picker";
import { ConfettiBurst } from "@/components/confetti-burst";
import { SettingsDialog } from "@/components/settings-dialog";
import { TimerBar } from "@/components/timer-bar";
import { WordCard } from "@/components/word-card";
import { ScoreHud } from "@/components/score-hud";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getBestScore, subscribeBestScoresChanged } from "@/lib/best-score";
import {
  getAllLevelIds,
  getLevelTitle,
  getMaxCoreLevel,
  getRoundsForLevel,
  levelKey,
  type LevelId,
} from "@/lib/levels";
import { useGameStore } from "@/lib/game-store";
import { loadSettings, subscribeSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const ALL_LEVEL_KEYS = new Set(getAllLevelIds().map((l) => levelKey(l)));

function parseLevel(raw: string | null): LevelId {
  if (raw && ALL_LEVEL_KEYS.has(raw)) {
    return /^\d+$/.test(raw) ? Number(raw) : raw;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  const max = getMaxCoreLevel();
  return Math.min(max, Math.max(1, Math.floor(n)));
}

interface PlayGameSessionProps {
  level: LevelId;
}

function PlayGameSession({ level }: PlayGameSessionProps) {
  const phase = useGameStore((s) => s.phase);
  const roundIndex = useGameStore((s) => s.roundIndex);
  const score = useGameStore((s) => s.score);
  const correctCount = useGameStore((s) => s.correctCount);
  const currentWord = useGameStore((s) => s.currentWord);
  const options = useGameStore((s) => s.options);
  const feedback = useGameStore((s) => s.feedback);
  const timerMsRemaining = useGameStore((s) => s.timerMsRemaining);
  const timerTotalMs = useGameStore((s) => s.timerTotalMs);

  const [userTimerPaused, setUserTimerPaused] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [completionCount, setCompletionCount] = useState(0);
  const autoAdvance = useSyncExternalStore(
    subscribeSettings,
    () => loadSettings().autoAdvance,
    () => true,
  );
  const noTimer = useSyncExternalStore(
    subscribeSettings,
    () => loadSettings().noTimer,
    () => false,
  );
  const timerPaused = userTimerPaused || cheatsheetOpen;

  useEffect(() => {
    if (phase === "summary") setCompletionCount((c) => c + 1);
  }, [phase]);

  useEffect(() => {
    useGameStore.getState().startSession(level);
    return () => {
      useGameStore.getState().resetIdle();
    };
  }, [level]);

  useEffect(() => {
    if (phase !== "playing" || timerPaused) return;
    const id = window.setInterval(() => {
      useGameStore.getState().tick(100);
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, roundIndex, currentWord?.hebrew, timerPaused]);

  useEffect(() => {
    if (phase !== "feedback" || !autoAdvance) return;
    const id = window.setTimeout(() => {
      useGameStore.getState().clearFeedbackAndAdvance();
    }, 1000);
    return () => window.clearTimeout(id);
  }, [phase, roundIndex, autoAdvance]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase === "playing") {
        const n = Number(e.key);
        if (n >= 1 && n <= 4) {
          e.preventDefault();
          useGameStore.getState().submitAnswer(n - 1);
        }
        return;
      }
      if (phase === "feedback" && !autoAdvance) {
        if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
          e.preventDefault();
          useGameStore.getState().clearFeedbackAndAdvance();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, timerPaused, autoAdvance]);

  const best = useSyncExternalStore(
    subscribeBestScoresChanged,
    () => getBestScore(level),
    () => 0,
  );

  return (
    <>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        <ScoreHud
          level={level}
          roundIndex={roundIndex}
          score={score}
          bestForLevel={best}
        />

        {phase === "summary" ? (
          <>
          <ConfettiBurst fireKey={`${levelKey(level)}:${completionCount}`} />
          <Card>
            <CardHeader>
              <CardTitle>Level complete</CardTitle>
              <CardDescription>
                {getLevelTitle(level)} · {correctCount}/{getRoundsForLevel(level)} correct
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  setUserTimerPaused(false);
                  setCheatsheetOpen(false);
                  useGameStore.getState().startSession(level);
                }}
              >
                Play again
              </Button>
              <Link
                href="/play"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Choose level
              </Link>
            </CardFooter>
          </Card>
          </>
        ) : (
          <>
            {!noTimer && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                <div className="min-w-0 flex-1">
                  <TimerBar
                    remainingMs={timerMsRemaining}
                    totalMs={timerTotalMs}
                    active={phase === "playing"}
                    paused={timerPaused}
                  />
                </div>
                {phase === "playing" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 self-start sm:mt-0.5"
                    onClick={() => setUserTimerPaused((p) => !p)}
                  >
                    {userTimerPaused ? "Resume" : "Pause"}
                  </Button>
                )}
              </div>
            )}
            <WordCard entry={currentWord} reveal={phase === "feedback"} />
            <AnswerOptions
              options={options}
              phase={phase}
              feedback={feedback}
              choicesDisabled={false}
              onSelect={(i) => useGameStore.getState().submitAnswer(i)}
            />
            {phase === "feedback" && feedback ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-center text-sm" aria-live="polite">
                  {feedback.correct ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      +{feedback.pointsAwarded} points
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No points</span>
                  )}
                </p>
                {!autoAdvance ? (
                  <Button
                    type="button"
                    onClick={() =>
                      useGameStore.getState().clearFeedbackAndAdvance()
                    }
                    autoFocus
                  >
                    Next word →
                    <span className="text-muted-foreground ml-2 text-xs">
                      (Space)
                    </span>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </main>

      <CheatsheetFab onOpenChange={setCheatsheetOpen} />
    </>
  );
}

export function PlayGame() {
  const searchParams = useSearchParams();
  const levelRaw = searchParams.get("level");
  const hasLevel =
    levelRaw !== null && String(levelRaw).trim().length > 0;

  if (!hasLevel) {
    return (
      <div className="bg-background relative min-h-dvh">
        <LevelPicker />
      </div>
    );
  }

  const level = parseLevel(levelRaw);

  return (
    <div className="bg-background relative min-h-dvh">
      <header className="border-b bg-card/60 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link
            href="/play"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            ← Levels
          </Link>
          <SettingsDialog level={level} />
        </div>
      </header>

      <PlayGameSession key={level} level={level} />
    </div>
  );
}
