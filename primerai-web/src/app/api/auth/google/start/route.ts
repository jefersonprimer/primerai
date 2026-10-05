import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function validNativeReturnUri(value: string): boolean {
  if (value === "primerai://auth/callback" || value === "primeraimobile://auth/callback") return true;
  try {
    const uri = new URL(value);
    if ((value === "http://localhost:1420/" || value === "http://127.0.0.1:1420/") && uri.protocol === "http:" && !uri.search && !uri.hash) return true;
    const privateIpv4 = /^(localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/;
    return uri.protocol === "exp:" && privateIpv4.test(uri.hostname) && uri.pathname === "/--/auth/callback" && !uri.search && !uri.hash;
  } catch { return false; }
}

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.redirect(new URL("/entrar#google-error", request.url));

  const state = randomBytes(32).toString("base64url");
  const returnUri = request.nextUrl.searchParams.get("return_uri")?.trim();
  if (returnUri && !validNativeReturnUri(returnUri)) return NextResponse.redirect(new URL("/entrar#google-error", request.url));
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? new URL("/api/auth/google/callback", request.url).toString();
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, prompt: "select_account" }).toString();
  const response = NextResponse.redirect(authorization);
  response.cookies.set("primerai-google-state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/google/callback", maxAge: 300 });
  if (returnUri) response.cookies.set("primerai-google-return", returnUri, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/google/callback", maxAge: 300 });
  return response;
}
