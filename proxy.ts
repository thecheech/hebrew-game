import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/", "/login", "/theodore"];

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.includes(pathname);
  const isAuthRoute = pathname.startsWith("/api/auth");

  if (isPublicPath || isAuthRoute) return NextResponse.next();
  if (request.auth) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  const callbackPath = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("callbackUrl", callbackPath);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
