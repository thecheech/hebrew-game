"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AnswerOption } from "@/lib/words";
import type { FeedbackState, GamePhase } from "@/lib/game-store";

interface AnswerOptionsProps {
  options: AnswerOption[];
  phase: GamePhase;
  feedback: FeedbackState | null;
  onSelect: (index: number) => void;
  /** When true, choices are not clickable (e.g. timer paused). */
  choicesDisabled?: boolean;
}

export function AnswerOptions({
  options,
  phase,
  feedback,
  onSelect,
  choicesDisabled = false,
}: AnswerOptionsProps) {
  const correctIndex = options.findIndex((o) => o.isCorrect);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((opt, index) => {
        const isChosen = feedback?.chosenIndex === index;
        const showSolution = phase === "feedback";
        const correctHighlight = showSolution && opt.isCorrect;
        const wrongChosen = showSolution && isChosen && !opt.isCorrect;

        return (
          <Button
            key={opt.id}
            type="button"
            variant="outline"
            size="lg"
            disabled={phase !== "playing" || choicesDisabled}
            className={cn(
              "h-auto min-h-14 justify-start px-4 py-3 text-left text-base whitespace-normal",
              correctHighlight &&
                "border-emerald-600/60 bg-emerald-500/15 text-emerald-950 dark:text-emerald-50",
              wrongChosen &&
                "border-destructive/60 bg-destructive/10 text-destructive",
            )}
            onClick={() => onSelect(index)}
          >
            <span className="text-muted-foreground mr-2 shrink-0 font-mono text-xs">
              {index + 1}
            </span>
            <span className="leading-snug tabular-nums">{opt.label}</span>
          </Button>
        );
      })}
      {phase === "feedback" &&
      correctIndex >= 0 &&
      feedback &&
      feedback.chosenIndex === null ? (
        <p className="text-muted-foreground col-span-full text-center text-sm sm:col-span-2">
          Time&apos;s up — correct:{" "}
          <span className="text-foreground font-medium">
            {options[correctIndex]?.label}
          </span>
        </p>
      ) : null}
    </div>
  );
}
