import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";

/**
 * Proxy (Next.js 16 file convention; replaces middleware.ts).
 *
 * Uses the edge-safe `auth.config.ts` so the proxy bundle does NOT pull in
 * Prisma / Neon — those only live in the [...nextauth] route handler bundle.
 * With JWT sessions, reading the cookie here is enough to gate routes.
 */
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = new Set(["/", "/login", "/theodore", "/play"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth")) return true;
  // Theodore landing: Miketz triennial player + its public assets.
  if (
    pathname === "/parasha/miketz/3" ||
    pathname.startsWith("/parasha/miketz/3/")
  ) {
    return true;
  }
  if (
    pathname.startsWith("/parasha/miketz/alt/") ||
    pathname.startsWith("/parasha/miketz/audio/")
  ) {
    return true;
  }
  // Mic scoring for open parasha practice (small surface: POST only).
  if (
    pathname === "/api/parasha/analyze" ||
    pathname === "/api/parasha/analyze-word"
  ) {
    return true;
  }
  return false;
}

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (request.auth) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  const callbackPath = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("callbackUrl", callbackPath);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
