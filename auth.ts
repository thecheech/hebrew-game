import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

import { prisma } from "@/lib/prisma";

/**
 * Lazy config ensures the Prisma adapter is attached on every Auth.js invocation.
 * With Turbopack, a static config object can lose or omit `adapter` in some server-action bundles,
 * which triggers MissingAdapter for email providers.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google,
    Resend({
      from: process.env.AUTH_RESEND_FROM ?? "Hebrew Game <onboarding@resend.dev>",
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 24 * 60 * 60, // 60 days
  },
  jwt: {
    maxAge: 60 * 24 * 60 * 60, // 60 days
  },
}));
