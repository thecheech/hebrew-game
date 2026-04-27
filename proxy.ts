import { auth } from "@/auth";
import { NextResponse } from "next/server";

/** Exact path matches that skip auth. */
const PUBLIC_PATHS = ["/", "/login", "/theodore", "/play"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
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

const authProxy = auth((request) => {
  const pathname = request.nextUrl.pathname;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (request.auth) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  const callbackPath = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("callbackUrl", callbackPath);
  return NextResponse.redirect(loginUrl);
});

export function proxy(...args: Parameters<typeof authProxy>) {
  return authProxy(...args);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
