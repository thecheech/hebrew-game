import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PracticeChooserPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/practice");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl items-center px-4 py-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Choose your practice mode</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/parasha"
            className="rounded-lg border p-4 transition-colors hover:bg-accent/40"
          >
            <h2 className="text-base font-semibold">Parasha practice</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Practice cantillation by parasha and aliya.
            </p>
          </Link>

          <Link
            href="/play"
            className="rounded-lg border p-4 transition-colors hover:bg-accent/40"
          >
            <h2 className="text-base font-semibold">
              Practice reading and vocabulary
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Train reading fluency and vocabulary in game mode.
            </p>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
