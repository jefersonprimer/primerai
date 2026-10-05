import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const value = request.cookies.get("primerai-google-session")?.value;
  const response = value
    ? NextResponse.json(JSON.parse(value), { headers: { "cache-control": "no-store" } })
    : NextResponse.json({ error: "missing_session" }, { status: 401, headers: { "cache-control": "no-store" } });
  response.cookies.set("primerai-google-session", "", { path: "/api/auth/google/session", maxAge: 0 });
  return response;
}
