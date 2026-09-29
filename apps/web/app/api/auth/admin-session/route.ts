import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function validateAdminTokenFormat(token?: string): boolean {
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

    const timestampStr = payloadParts[payloadParts.length - 1];
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp) || Date.now() - timestamp > TOKEN_TTL_MS || timestamp > Date.now() + 3600000) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = body?.token;

    if (!token || !validateAdminTokenFormat(token)) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired admin session token" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set("admin-access-token", token, {
      httpOnly: false, // Accessible by client and server for seamless sync
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.set("admin-access-token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return NextResponse.json({ success: true, message: "Admin session cleared" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
