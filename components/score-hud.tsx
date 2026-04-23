"use client";

import { Badge } from "@/components/ui/badge";
import {
  describeLevel,
  getRoundsForLevel,
  type LevelId,
} from "@/lib/levels";

interface ScoreHudProps {
  level: LevelId;
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
  const total = getRoundsForLevel(level);
  const roundDisplay = Math.min(roundIndex + 1, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{describeLevel(level)}</Badge>
        <span className="text-muted-foreground">
          Round {roundDisplay}/{total}
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
