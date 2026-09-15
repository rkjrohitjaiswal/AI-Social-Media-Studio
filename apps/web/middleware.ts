import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const LANDING_SECTION_ROUTES = [
  "/product",
  "/features",
  "/how-it-works",
  "/platforms",
  "/byok",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (LANDING_SECTION_ROUTES.includes(pathname)) {
    const sessionRes = await updateSession(request);
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = "/";
    const rewriteRes = NextResponse.rewrite(rewriteUrl, {
      request: {
        headers: request.headers,
      },
    });
    sessionRes.cookies.getAll().forEach((c) => {
      rewriteRes.cookies.set(c.name, c.value, c);
    });
    return rewriteRes;
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (.png, .jpg, .svg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
