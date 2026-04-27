import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function Home() {
  // Logged-in users skip the landing page entirely
  const session = await auth();
  if (session?.user) redirect("/practice");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
      {/* Hebrew decorative text */}
      <div
        className="mb-6 font-serif text-6xl leading-none text-primary/80 sm:text-7xl"
        dir="rtl"
        lang="he"
        aria-hidden
      >
        בְּרֵאשִׁית
      </div>

      <div className="max-w-lg space-y-4">
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Practice your Torah portion
        </h1>
        <p className="text-muted-foreground text-base sm:text-lg">
          Word-by-word cantillation practice built for Bar and Bat Mitzvah
          students. Follow the trope, loop a phrase, track your progress.
        </p>
      </div>

      {/* Primary CTA */}
      <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <Link href="/onboard" className={cn(buttonVariants({ size: "lg" }), "min-w-48")}>
          Set up my practice
        </Link>
        <Link
          href="/login"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "min-w-48",
          )}
        >
          Sign in
        </Link>
      </div>

      {/* Feature nudges */}
      <ul className="mt-14 grid max-w-2xl grid-cols-1 gap-5 text-left sm:grid-cols-3">
        {[
          {
            icon: "🎵",
            title: "Cantillation audio",
            body: "Listen to reference chant and follow word-by-word.",
          },
          {
            icon: "🔁",
            title: "Loop any phrase",
            body: "Isolate a tricky passage and repeat until it sticks.",
          },
          {
            icon: "📖",
            title: "Your parasha",
            body: "Focused practice on the exact portion you'll chant.",
          },
        ].map(({ icon, title, body }) => (
          <li key={title} className="flex gap-3 rounded-xl border border-border bg-card p-4">
            <span className="text-2xl" aria-hidden>
              {icon}
            </span>
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
