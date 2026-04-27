import type { NextAuthConfig } from "next-auth";

/**
 * Edge/proxy-safe config: no Prisma adapter, no DB-backed providers.
 * Imported by `proxy.ts` so the proxy bundle stays small and free of
 * Node-only modules like @prisma/client + @prisma/adapter-neon, whose
 * presence in the proxy chunk caused TurboPack to emit a broken handler
 * (`TypeError: D is not a function`) on Vercel.
 *
 * The full config (auth.ts) extends this with the adapter and providers
 * and is what the [...nextauth] route handler uses for sign-in/callback.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify-request",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 24 * 60 * 60, // 60 days
  },
  jwt: {
    maxAge: 60 * 24 * 60 * 60, // 60 days
  },
  // Providers must be present (NextAuth requires the array to exist) but
  // can be empty here — the proxy never executes a sign-in flow, it only
  // reads the JWT cookie to decide whether the request is authenticated.
  providers: [],
} satisfies NextAuthConfig;
