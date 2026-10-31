import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Every dashboard request (pages, RSC navigations and Server Action POSTs) needs a
 * PROVIDER token, because dashboard pages read the database directly. Server Actions
 * still authorize on their own: the API checks the token they forward.
 */
export async function proxy(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session?.role !== "PROVIDER") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
