import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/config";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const notionError = request.nextUrl.searchParams.get("error");
  if (!code || !state || notionError) return NextResponse.redirect(new URL("/integrations/notion/complete?status=error", request.url));
  try {
    const response = await fetch(`${apiUrl}/v1/integrations/notion/callback`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, state }), cache: "no-store",
    });
    return NextResponse.redirect(new URL(response.ok ? "/integrations/notion/complete?status=connected" : "/integrations/notion/complete?status=error", request.url));
  } catch {
    return NextResponse.redirect(new URL("/integrations/notion/complete?status=error", request.url));
  }
}
