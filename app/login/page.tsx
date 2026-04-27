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

interface LoginPageProps {
  searchParams: Promise<{
    callbackUrl?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  if (session?.user) redirect("/practice");

  const { callbackUrl } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to continue</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={signInWithGoogle}>
            <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/practice"} />
            <Button type="submit" className="w-full" size="lg">
              Continue with Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
