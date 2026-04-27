import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function signInWithGoogle(formData: FormData) {
  "use server";

  const callbackUrlFromForm = formData.get("callbackUrl");
  const isSafeRelativePath =
    typeof callbackUrlFromForm === "string" &&
    callbackUrlFromForm.length > 0 &&
    callbackUrlFromForm.startsWith("/");
  const callbackUrl =
    isSafeRelativePath ? callbackUrlFromForm : "/practice";

  await signIn("google", { redirectTo: callbackUrl });
}

async function signInWithEmail(formData: FormData) {
  "use server";

  const callbackUrlFromForm = formData.get("callbackUrl");
  const isSafeRelativePath =
    typeof callbackUrlFromForm === "string" &&
    callbackUrlFromForm.length > 0 &&
    callbackUrlFromForm.startsWith("/");
  const callbackUrl =
    isSafeRelativePath ? callbackUrlFromForm : "/practice";

  const emailFromForm = formData.get("email");
  const email =
    typeof emailFromForm === "string"
      ? emailFromForm.trim().toLowerCase()
      : "";

  if (!email) redirect("/login?error=EmailRequired");

  await signIn("resend", { email, redirectTo: callbackUrl });
}

interface LoginPageProps {
  searchParams: Promise<{
    callbackUrl?: string;
    error?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  if (session?.user) redirect("/practice");

  const { callbackUrl, error } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to continue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <form action={signInWithEmail} className="space-y-3">
              <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/practice"} />
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <Button type="submit" className="w-full" size="lg">
                Send sign-in link
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <form action={signInWithGoogle}>
              <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/practice"} />
              <Button type="submit" className="w-full" size="lg" variant="outline">
                Continue with Google
              </Button>
            </form>
          </div>
          {error ? (
            <p className="text-destructive mt-4 text-sm">
              We could not send the sign-in email. Please try again.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
