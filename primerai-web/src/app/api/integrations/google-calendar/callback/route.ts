import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/config";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return NextResponse.redirect(new URL("/conta?calendar=error", request.url));
  try {
    const response = await fetch(`${apiUrl}/v1/integrations/calendar/callback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, state }), cache: "no-store" });
    return NextResponse.redirect(new URL(`/conta?calendar=${response.ok ? "connected" : "error"}`, request.url));
  } catch { return NextResponse.redirect(new URL("/conta?calendar=error", request.url)); }
}
