import { Suspense } from "react";

import { PlayGame } from "@/components/play-game";

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <div className="text-muted-foreground flex min-h-dvh items-center justify-center p-8 text-sm">
          Loading game…
        </div>
      }
    >
      <PlayGame />
    </Suspense>
  );
}
