"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { AnswerOptions } from "@/components/answer-options";
import { CheatsheetFab } from "@/components/cheatsheet";
import { SettingsDialog } from "@/components/settings-dialog";
import { TimerBar } from "@/components/timer-bar";
import { WordCard } from "@/components/word-card";
import { ScoreHud } from "@/components/score-hud";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getBestScore, subscribeBestScoresChanged } from "@/lib/best-score";
import { LEVEL_COUNT, ROUNDS_PER_LEVEL } from "@/lib/levels";
import { useGameStore } from "@/lib/game-store";
import { cn } from "@/lib/utils";

function parseLevel(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(LEVEL_COUNT, Math.max(1, Math.floor(n)));
}

interface PlayGameSessionProps {
  level: number;
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
  const timerPaused = userTimerPaused || cheatsheetOpen;

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
    if (phase !== "feedback") return;
    const id = window.setTimeout(() => {
      useGameStore.getState().clearFeedbackAndAdvance();
    }, 1000);
    return () => window.clearTimeout(id);
  }, [phase, roundIndex]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase !== "playing" || timerPaused) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        e.preventDefault();
        useGameStore.getState().submitAnswer(n - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, timerPaused]);

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
          <Card>
            <CardHeader>
              <CardTitle>Level complete</CardTitle>
              <CardDescription>
                You finished {ROUNDS_PER_LEVEL} rounds on level {level}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Final score:{" "}
                <strong className="text-lg tabular-nums">{score}</strong>
              </p>
              <p className="text-muted-foreground">
                Correct answers: {correctCount}/{ROUNDS_PER_LEVEL}
              </p>
              <p className="text-muted-foreground">
                Best for this level:{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {Math.max(best, score)}
                </span>
              </p>
            </CardContent>
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
                href="/"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Choose level
              </Link>
            </CardFooter>
          </Card>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
              <div className="min-w-0 flex-1">
                <TimerBar
                  remainingMs={timerMsRemaining}
                  totalMs={timerTotalMs}
                  active={phase === "playing"}
                  paused={timerPaused}
                />
              </div>
              {phase === "playing" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-start sm:mt-0.5"
                  onClick={() => setUserTimerPaused((p) => !p)}
                >
                  {userTimerPaused ? "Resume" : "Pause"}
                </Button>
              ) : null}
            </div>
            <WordCard entry={currentWord} reveal={phase === "feedback"} />
            <AnswerOptions
              options={options}
              phase={phase}
              feedback={feedback}
              choicesDisabled={timerPaused}
              onSelect={(i) => useGameStore.getState().submitAnswer(i)}
            />
            {phase === "feedback" && feedback ? (
              <p
                className="text-center text-sm"
                aria-live="polite"
              >
                {feedback.correct ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    +{feedback.pointsAwarded} points
                  </span>
                ) : (
                  <span className="text-muted-foreground">No points</span>
                )}
              </p>
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
  const level = useMemo(
    () => parseLevel(searchParams.get("level")),
    [searchParams],
  );

  return (
    <div className="bg-background relative min-h-dvh">
      <header className="border-b bg-card/60 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link
            href="/"
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
