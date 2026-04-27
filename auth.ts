import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

export const { handlers, auth, signIn, signOut } = NextAuth({
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
    maxAge: 60 * 24 * 60 * 60, // 60 days
  },
  jwt: {
    maxAge: 60 * 24 * 60 * 60, // 60 days
  },
});
