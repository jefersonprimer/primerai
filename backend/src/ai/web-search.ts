export type WebResult = { title: string; url: string; snippet: string };

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
