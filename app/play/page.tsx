import { Suspense } from "react";

import { LevelPicker } from "@/components/level-picker";
import { PlayGameActive } from "@/components/play-game";

function normalizeLevelQuery(
  raw: string | string[] | undefined,
): string | null {
  if (raw === undefined) return null;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s == null || String(s).trim() === "") return null;
  return String(s);
}

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string | string[] }>;
}) {
  const sp = await searchParams;
  const levelParam = normalizeLevelQuery(sp.level);

  if (!levelParam) {
    return (
      <div className="bg-background relative min-h-dvh">
        <LevelPicker />
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="text-muted-foreground flex min-h-dvh items-center justify-center p-8 text-sm">
          Loading game…
        </div>
      }
    >
      <PlayGameActive levelParam={levelParam} />
    </Suspense>
  );
}
