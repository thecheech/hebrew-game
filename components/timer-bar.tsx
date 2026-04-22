"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface TimerBarProps {
  remainingMs: number;
  totalMs: number;
  active: boolean;
  /** Countdown is frozen (manual pause or cheatsheet open). */
  paused?: boolean;
}

export function TimerBar({
  remainingMs,
  totalMs,
  active,
  paused = false,
}: TimerBarProps) {
  const pct =
    totalMs > 0 ? Math.min(100, Math.max(0, (remainingMs / totalMs) * 100)) : 0;
  const urgent = active && !paused && pct < 25;

  return (
    <div className="w-full space-y-1">
      <div className="text-muted-foreground flex justify-between text-xs font-medium tabular-nums">
        <span>Time</span>
        <span className={cn(urgent && "text-destructive font-semibold")}>
          {(remainingMs / 1000).toFixed(1)}s
          {paused ? (
            <span className="text-muted-foreground ml-1.5 font-normal">
              · paused
            </span>
          ) : null}
        </span>
      </div>
      <Progress
        value={pct}
        className={cn(urgent && "[&_[data-slot=progress-indicator]]:bg-destructive")}
      />
    </div>
  );
}
