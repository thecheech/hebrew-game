import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

import { authConfig } from "@/auth.config";
import { signInEmailHtml, signInEmailText } from "@/lib/auth-sign-in-email";
import { prisma } from "@/lib/prisma";

function authAppDisplayName() {
  return process.env.AUTH_APP_NAME ?? "Bar Mitzva App";
}

/**
 * Full Auth.js setup with Prisma adapter + providers.
 * Used by the [...nextauth] route handler and any server code that needs
 * the real `auth()` (server actions, server components, etc.).
 *
 * The proxy uses `auth.config.ts` directly so it doesn't pull Prisma into
 * its serverless bundle.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Google,
    Resend({
      // Auth.js docs use AUTH_RESEND_KEY; TopUp Credits uses RESEND_API_KEY — accept both.
      apiKey: process.env.AUTH_RESEND_KEY ?? process.env.RESEND_API_KEY,
      from:
        process.env.AUTH_RESEND_FROM ??
        "Hebrew Game <noreply@topupcredits.com>",
      /** Use product name in email copy instead of the raw deployment hostname. */
      async sendVerificationRequest(params) {
        const { identifier, url, provider, theme } = params;
        const appName = authAppDisplayName();
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject: `Sign in to ${appName}`,
            html: signInEmailHtml({ url, host: appName, theme: theme ?? {} }),
            text: signInEmailText({ url, host: appName }),
          }),
        });
        if (!res.ok) {
          throw new Error("Resend error: " + JSON.stringify(await res.json()));
        }
      },
    }),
  ],
});
