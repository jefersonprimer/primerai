import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/config";

export const runtime = "nodejs";

function failure(request: NextRequest) {
  return NextResponse.redirect(new URL("/entrar#google-error", request.url));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const expectedState = request.cookies.get("primerai-google-state")?.value;
  if (!code || !returnedState || !expectedState || returnedState !== expectedState) return failure(request);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return failure(request);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? new URL("/api/auth/google/callback", request.url).toString();

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }), cache: "no-store",
    });
    if (!tokenResponse.ok) return failure(request);
    const tokenBody = await tokenResponse.json() as { id_token?: string };
    if (!tokenBody.id_token) return failure(request);

    const loginResponse = await fetch(`${apiUrl}/v1/auth/google`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: tokenBody.id_token }), cache: "no-store" });
    if (!loginResponse.ok) return failure(request);
    const result = await loginResponse.json() as { session?: unknown };
    if (!result.session) return failure(request);
    const nativeReturn = request.cookies.get("primerai-google-return")?.value;
    if (nativeReturn) {
      const session = result.session as { accessToken?: string };
      if (!session.accessToken) return failure(request);
      const handoffResponse = await fetch(`${apiUrl}/v1/auth/native-code`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${session.accessToken}` },
        cache: "no-store",
      });
      if (!handoffResponse.ok) return failure(request);
      const handoff = await handoffResponse.json() as { code?: string };
      if (!handoff.code) return failure(request);
      const target = new URL(nativeReturn);
      target.hash = `code=${encodeURIComponent(handoff.code)}`;
      const nativeResponse = NextResponse.redirect(target);
      nativeResponse.cookies.set("primerai-google-state", "", { path: "/api/auth/google/callback", maxAge: 0 });
      nativeResponse.cookies.set("primerai-google-return", "", { path: "/api/auth/google/callback", maxAge: 0 });
      return nativeResponse;
    }
    const response = NextResponse.redirect(new URL("/auth/complete", request.url));
    response.cookies.set("primerai-google-state", "", { path: "/api/auth/google/callback", maxAge: 0 });
    response.cookies.set("primerai-google-return", "", { path: "/api/auth/google/callback", maxAge: 0 });
    response.cookies.set("primerai-google-session", JSON.stringify(result.session), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth/google/session",
      maxAge: 60,
    });
    return response;
  } catch {
    return failure(request);
  }
}
