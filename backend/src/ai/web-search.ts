import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type WebResult = { title: string; url: string; snippet: string };

export type WebPage = WebResult & { content: string; fetchedAt: string };

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]*>/g, "").trim();
}

/** A web lookup used only when the user explicitly asks for current/web research. */
export async function searchWeb(query: string): Promise<WebResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { "user-agent": "PrimerAI/1.0 (web research)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Pesquisa web indisponível (HTTP ${response.status}).`);
  const html = await response.text();
  const results: WebResult[] = [];
  const blocks = html.split(/<div class="result results_links[^>]*>/).slice(1);
  for (const block of blocks) {
    const link = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippet = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)
      ?? block.match(/<div[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
    if (!link) continue;
    let resultUrl = decodeHtml(link[1]!);
    try {
      const parsed = new URL(resultUrl, "https://duckduckgo.com");
      const redirected = parsed.searchParams.get("uddg");
      if (redirected) resultUrl = decodeURIComponent(redirected);
    } catch { continue; }
    if (!/^https?:\/\//i.test(resultUrl)) continue;
    results.push({ title: decodeHtml(link[2]!), url: resultUrl, snippet: decodeHtml(snippet?.[1] ?? "") });
    if (results.length === 8) break;
  }
  if (!results.length) throw new Error("A pesquisa web não retornou resultados. Tente novamente mais tarde.");
  return results;
}

/** Fetch public result pages with redirect, time and response-size limits. */
export async function readWebPage(result: WebResult): Promise<WebPage | null> {
  return readWebPageAt(result, 0);
}

async function readWebPageAt(result: WebResult, redirects: number): Promise<WebPage | null> {
  if (redirects > 3) return null;
  let url: URL;
  try { url = new URL(result.url); } catch { return null; }
  if (!(await isPublicWebUrl(url))) return null;

  try {
    const response = await fetch(url, {
      headers: { "user-agent": "PrimerAI/1.0 (web research)", accept: "text/html,application/xhtml+xml,text/plain" },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      const redirected = new URL(location, url);
      if (!(await isPublicWebUrl(redirected))) return null;
      return readWebPageAt({ ...result, url: redirected.toString() }, redirects + 1);
    }
    if (!response.ok || !/^text\/(html|plain)/i.test(response.headers.get("content-type") ?? "")) return null;
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 1_000_000 || !response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1_000_000) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks));
    const content = html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/\s+/g, " ").trim().slice(0, 8_000);
    if (!content) return null;
    return { ...result, url: url.toString(), content, fetchedAt: new Date().toISOString() };
  } catch { return null; }
}

async function isPublicWebUrl(url: URL): Promise<boolean> {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
  if (url.port && url.port !== "80" && url.port !== "443") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  try {
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => isPublicIp(address));
  } catch { return false; }
}

function isPublicIp(address: string): boolean {
  if (isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    return parts[0] !== 0 && parts[0] !== 10 && parts[0] !== 127 && parts[0]! < 224
      && !(parts[0] === 169 && parts[1] === 254)
      && !(parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31)
      && !(parts[0] === 192 && parts[1] === 168)
      && !(parts[0] === 100 && parts[1]! >= 64 && parts[1]! <= 127)
      && !(parts[0] === 192 && parts[1] === 0)
      && !(parts[0] === 192 && parts[1] === 0 && parts[2] === 2)
      && !(parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || parts[1] === 51 && parts[2] === 100))
      && !(parts[0] === 203 && parts[1] === 0 && parts[2] === 113);
  }
  const firstSegment = Number.parseInt(address.split(":")[0] || "0", 16);
  // Global unicast IPv6 is in 2000::/3. This excludes mapped, loopback,
  // link-local, unique-local and multicast addresses.
  return (firstSegment & 0xe000) === 0x2000;
}

export function asksForWebResearch(text: string): boolean {
  return /\b(busca|busque|buscar|pesquis|pesquise|pesquisar|procura|procure|encontre)\b.{0,35}\b(internet|web|online)\b/i.test(text)
    || /\b(fontes atuais|dados atuais|notícias atuais)\b/i.test(text)
    || /(?:inten|itenc)(?:ç|c|s)?(?:ão|ao|oes|ões)?\s+de\s+votos?/i.test(text)
    || /votos?.{0,30}president|president.{0,30}votos?/i.test(text)
    || /\b(top\s*\d+|\d+\s+maiores|melhores|ranking|classifique|mais populares|de todos os tempos|atualmente|hoje)\b/i.test(text);
}

export function researchPrompt(query: string, results: WebResult[]): string {
  const sources = results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nResumo do buscador: ${r.snippet}`).join("\n\n");
  return `Pesquise usando os resultados atuais abaixo. Responda em português, diferencie fatos de estimativas, não invente números e inclua uma seção Fontes com título, URL e data de acesso (${new Date().toISOString().slice(0, 10)}). Se os resultados forem insuficientes, diga isso claramente.\n\nPedido: ${query}\n\nRESULTADOS DA WEB:\n${sources}`;
}
