import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function TheodorePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl items-center justify-center px-4 py-8">
      <div className="w-full space-y-4 rounded-xl border bg-card p-6 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">Choose practice mode</h1>
        <p className="text-muted-foreground text-sm">
          Pick where you want to go.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/play"
            className={cn(buttonVariants({ size: "lg" }), "sm:min-w-64")}
          >
            Practice reading and vocabulary
          </Link>
          <Link
            href="/parasha/miketz/3"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "sm:min-w-64",
            )}
          >
            Theodore&apos;s parasha (Miketz 3)
          </Link>
        </div>
      </div>
    </main>
  );
}
