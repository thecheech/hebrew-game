"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { CheatsheetFab } from "@/components/cheatsheet";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadBestScores } from "@/lib/best-score";
import {
  getAllLevelIds,
  getLevelLabel,
  getLevelTitle,
  getRoundsForLevel,
  levelKey,
} from "@/lib/levels";
import { cn } from "@/lib/utils";

/** Stable empty snapshot — required for `getServerSnapshot` (same reference every call). */
const EMPTY_BEST_SCORES: Record<string, number> = {};

let clientBestScoresSnapshot: Record<string, number> = EMPTY_BEST_SCORES;

function pullBestScoresIntoCache(): void {
  const data = loadBestScores();
  clientBestScoresSnapshot =
    Object.keys(data).length === 0 ? EMPTY_BEST_SCORES : data;
}

function subscribeBestScores(onStoreChange: () => void) {
  const sync = () => {
    pullBestScoresIntoCache();
    onStoreChange();
  };
  pullBestScoresIntoCache();
  window.addEventListener("storage", sync);
  window.addEventListener("hebrew-game-best-changed", sync);
  return () => {
    window.removeEventListener("storage", sync);
    window.removeEventListener("hebrew-game-best-changed", sync);
  };
}

function getBestScoresSnapshot(): Record<string, number> {
  if (typeof window === "undefined") return EMPTY_BEST_SCORES;
  return clientBestScoresSnapshot;
}

export function LevelPicker() {
  const best = useSyncExternalStore(
    subscribeBestScores,
    getBestScoresSnapshot,
    () => EMPTY_BEST_SCORES,
  );

  return (
    <>
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <div className="space-y-2 text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Hebrew word match
        </h1>
        <p className="text-muted-foreground mx-auto max-w-xl text-sm sm:text-base">
          Read the Hebrew word with nikud (vowel marks), then pick its English
          pronunciation (transliteration). Easy = 1 point, medium = 2, hard = 3.
          Twenty levels from beginner to advanced.
        </p>
        <div className="flex justify-center">
          <Link
            href="/admin"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-muted-foreground",
            )}
          >
            Manage word list →
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pick a level</CardTitle>
          <CardDescription>
            Each level uses its own word set. Higher levels include harder
            vocabulary and shorter timers by default (changeable in settings
            during a game).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {getAllLevelIds().map((lv) => {
              const b = best[levelKey(lv)] ?? 0;
              const rounds = getRoundsForLevel(lv);
              return (
                <li key={levelKey(lv)}>
                  <Link
                    href={`/play?level=${levelKey(lv)}`}
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "h-auto w-full flex-col gap-0.5 py-3 no-underline",
                    )}
                  >
                    <span className="text-base font-semibold">
                      {getLevelTitle(lv)}
                    </span>
                    <span className="text-muted-foreground text-[0.65rem] leading-tight">
                      {getLevelLabel(lv)} · {rounds}q
                    </span>
                    {b > 0 ? (
                      <span className="text-muted-foreground text-[0.65rem] tabular-nums">
                        Best: {b}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
    <CheatsheetFab />
    </>
  );
}
