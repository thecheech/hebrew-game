"use client";

import { Badge } from "@/components/ui/badge";
import { describeLevel, ROUNDS_PER_LEVEL } from "@/lib/levels";

interface ScoreHudProps {
  level: number;
  roundIndex: number;
  score: number;
  bestForLevel: number;
}

export function ScoreHud({
  level,
  roundIndex,
  score,
  bestForLevel,
}: ScoreHudProps) {
  const roundDisplay = Math.min(roundIndex + 1, ROUNDS_PER_LEVEL);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{describeLevel(level)}</Badge>
        <span className="text-muted-foreground">
          Round {roundDisplay}/{ROUNDS_PER_LEVEL}
        </span>
      </div>
      <div className="flex items-center gap-3 tabular-nums">
        <span>
          Score: <strong className="text-foreground">{score}</strong>
        </span>
        <span className="text-muted-foreground">
          Best: <strong className="text-foreground">{bestForLevel}</strong>
        </span>
      </div>
    </div>
  );
}
