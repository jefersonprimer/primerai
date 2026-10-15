import { NextRequest, NextResponse } from "next/server";
import { apiUrl } from "@/lib/config";

export const runtime = "nodejs";

function failure(request: NextRequest) {
  return NextResponse.redirect(new URL("/entrar#google-error", request.url));
}

function nativeHandoffPage(request: NextRequest, target: URL) {
  // A web page gives browsers a user-gesture fallback when automatic protocol
  // activation is blocked. Encode the URL as JSON and escape HTML-sensitive
  // characters because it is embedded in an inline script.
  const encodedTarget = JSON.stringify(target.toString()).replace(/</g, "\\u003c");
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Concluir login · PrimerAI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;background:#f7f7f8;color:#202124;font:16px/1.5 system-ui,sans-serif}
header{display:flex;align-items:center;justify-content:center;gap:10px;padding:32px 24px 0;font-family:Manrope,system-ui,sans-serif;font-size:24px;font-weight:800;letter-spacing:-1.2px;color:#202124}
header img{width:40px;height:40px}
main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;width:100%;max-width:440px;padding:24px;text-align:center}
h1{margin:0;font-size:24px;letter-spacing:-.4px}
p{margin:0;line-height:1.55;color:#5f6368}
.button{display:inline-block;padding:12px 18px;border-radius:10px;background:#19191c;color:white;text-decoration:none;font-weight:600}
.hint{font-size:14px;color:#80868b}
</style>
</head>
<body>
<header><img src="/logo.png" alt=""><span>PrimerAI</span></header>
<main>
<h1>Continue o login no PrimerAI</h1>
<p>O PrimerAI deve abrir automaticamente. Se isso não acontecer, selecione o botão abaixo. Você pode fechar esta janela depois que o app abrir.</p>
<a class="button" id="open-app" href="#">Abrir PrimerAI</a>
<p class="hint">Se o app não abrir, verifique se o PrimerAI Desktop está instalado.</p>
</main>
<script>const target=${encodedTarget};document.getElementById('open-app').href=target;setTimeout(()=>{window.location.href=target},250)</script>
</body>
</html>`;
  const response = new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  response.cookies.set("primerai-google-state", "", { path: "/api/auth/google/callback", maxAge: 0 });
  response.cookies.set("primerai-google-return", "", { path: "/api/auth/google/callback", maxAge: 0 });
  return response;
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
        body: "{}",
        cache: "no-store",
      });
      if (!handoffResponse.ok) return failure(request);
      const handoff = await handoffResponse.json() as { code?: string };
      if (!handoff.code) return failure(request);
      const target = new URL(nativeReturn);
      target.hash = `code=${encodeURIComponent(handoff.code)}`;
      if (target.protocol !== "primerai:" || target.hostname !== "auth" || target.pathname !== "/callback") return failure(request);
      return nativeHandoffPage(request, target);
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
