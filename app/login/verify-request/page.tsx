import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authAppDisplayName } from "@/lib/auth-app-name";
import { cn } from "@/lib/utils";

export default async function VerifyRequestPage() {
  const session = await auth();
  if (session?.user) redirect("/practice");

  const appName = authAppDisplayName();

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            A sign in link has been sent to your email address.
          </p>
          <p className="text-center text-sm font-medium">{appName}</p>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
          >
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
