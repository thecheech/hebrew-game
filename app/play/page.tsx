import { Suspense } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PlayGame } from "@/components/play-game";

export default async function PlayPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/play");

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
