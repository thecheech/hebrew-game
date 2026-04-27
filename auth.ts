import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";

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
      from:
        process.env.AUTH_RESEND_FROM ?? "Hebrew Game <onboarding@resend.dev>",
    }),
  ],
});
