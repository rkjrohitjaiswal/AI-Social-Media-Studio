import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function isValidAdminSession(token?: string): boolean {
  if (!token || typeof token !== "string" || !token.startsWith("adm_")) return false;
  try {
    const raw = token.substring(4);
    const parts = raw.split(".");
    if (parts.length !== 2) return false;
    const [payloadB64, signature] = parts;
    if (!payloadB64 || !signature) return false;

    let b64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const payload = atob(b64);
    const payloadParts = payload.split(":");
    if (payloadParts.length < 3) return false;

    const timestamp = parseInt(payloadParts[2], 10);
    if (isNaN(timestamp) || Date.now() - timestamp > TOKEN_TTL_MS || timestamp > Date.now() + 60000) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const adminCookie = request.cookies.get("admin-access-token")?.value;
  const isAdminAuthenticated = isValidAdminSession(adminCookie);

  const hasDevBypassParam = request.nextUrl.searchParams.get("dev_bypass") === "true";
  const hasDevBypassCookie = request.cookies.get("dev_bypass")?.value === "true";
  const isDevBypass = process.env.NODE_ENV === "development" && (hasDevBypassCookie || hasDevBypassParam);

  if (hasDevBypassParam && process.env.NODE_ENV === "development") {
    supabaseResponse.cookies.set("dev_bypass", "true", { path: "/", maxAge: 86400 });
  }

  const isProtectedPath = [
    "/dashboard",
    "/create",
    "/goals",
    "/tools",
    "/templates",
    "/saved",
    "/campaigns",
    "/approvals",
    "/calendar",
    "/published",
    "/analytics",
    "/brand",
    "/settings",
    "/content-studio",
    "/repurpose",
  ].some((path) => request.nextUrl.pathname.startsWith(path));

  const isAuthPath = ["/login", "/signup", "/forgot-password"].includes(
    request.nextUrl.pathname
  );

  // If user is NOT authenticated (neither Supabase user nor admin session) and attempting to access protected route -> redirect to /login
  if (!user && !isAdminAuthenticated && !isDevBypass && isProtectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => {
      response.cookies.set(c.name, c.value, c);
    });
    return response;
  }

  // If user IS authenticated and trying to access auth pages -> redirect to /dashboard
  if ((user || isAdminAuthenticated) && isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => {
      response.cookies.set(c.name, c.value, c);
    });
    return response;
  }

  return supabaseResponse;
}
