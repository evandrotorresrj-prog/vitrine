// POST (logado) { contexto?, slides: [{ titulo, corpo }], termos?: string[], excluir?: string[] }
//   → { imagens: [{ url, credito, link } | null] }
// termos  = busca escolhida pelo corretor (pula a IA); excluir = URLs de fotos que ele já viu (pra "trocar foto")
// Busca FOTOS REAIS em alta resolução em bancos de fotos profissionais com licença livre pra uso comercial:
// Unsplash (principal) e Pexels (reserva, se houver chave). Guardamos o nome do fotógrafo como crédito.
// A IA (Claude) só escolhe as palavras de busca de cada slide.
// Secrets: UNSPLASH_ACCESS_KEY (grátis em unsplash.com/developers) e/ou PEXELS_API_KEY; ANTHROPIC_API_KEY (já existe)
import { handle, HttpError, json, requireUser } from "../_shared/util.ts";

const UNSPLASH = Deno.env.get("UNSPLASH_ACCESS_KEY");
const PEXELS = Deno.env.get("PEXELS_API_KEY");
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");

type Slide = { titulo?: string; corpo?: string };

// pede ao Claude 1 busca curta em inglês por slide (fotos de banco de imagem respondem melhor em inglês)
async function termosDeBusca(contexto: string, slides: Slide[]): Promise<string[]> {
  const fallback = slides.map((s) => `${contexto} ${s.titulo ?? ""}`.trim().slice(0, 80) || "modern apartment brazil");
  if (!ANTHROPIC) return fallback;
  try {
    const lista = slides.map((s, i) => `${i + 1}. ${s.titulo ?? ""} — ${(s.corpo ?? "").slice(0, 160)}`).join("\n");
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `Você escolhe fotos REAIS de banco de imagens para um carrossel de Instagram de um corretor de imóveis no Brasil.
Contexto: ${contexto || "mercado imobiliário"}
Slides:
${lista}

Para cada slide, escreva UMA busca curta em INGLÊS (2 a 5 palavras) que traga uma foto real, bonita e diretamente relacionada ao assunto do slide (ex.: "modern apartment living room", "house keys handover", "couple signing contract", "beach view balcony").
Evite pessoas olhando pra câmera e evite qualquer coisa com texto.
Responda SÓ com um array JSON de strings, na mesma ordem dos slides.`,
        }],
      }),
    });
    const d = await r.json();
    const txt: string = d?.content?.[0]?.text ?? "";
    const arr = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1));
    if (Array.isArray(arr) && arr.length === slides.length) return arr.map((q: unknown, i: number) => String(q || fallback[i]));
  } catch (e) { console.error("termos:", e); }
  return fallback;
}

const base = (u: string) => (u || "").split("?")[0];

async function buscarUnsplash(q: string, usados: Set<string>) {
  const u = new URL("https://api.unsplash.com/search/photos");
  u.searchParams.set("query", q);
  u.searchParams.set("orientation", "portrait");
  u.searchParams.set("content_filter", "high");
  u.searchParams.set("per_page", "10");
  const r = await fetch(u, { headers: { Authorization: `Client-ID ${UNSPLASH}`, "Accept-Version": "v1" } });
  if (!r.ok) throw new HttpError(502, "Banco de fotos indisponível (" + r.status + ").");
  const d = await r.json();
  // deno-lint-ignore no-explicit-any
  const foto = (d.results ?? []).find((p: any) => !usados.has("u" + p.id) && !usados.has(base(p.urls.raw)) && p.width >= 1080);
  if (!foto) return null;
  usados.add("u" + foto.id);
  // regra da API do Unsplash: avisar o "download" quando a foto é escolhida pra uso
  fetch(foto.links.download_location, { headers: { Authorization: `Client-ID ${UNSPLASH}` } }).catch(() => {});
  // já recortada em 4:5 e 1080x1350 (alta resolução, tamanho exato do Instagram) pela CDN do Unsplash
  return {
    url: `${foto.urls.raw}&w=1080&h=1350&fit=crop&crop=entropy&q=85&fm=jpg`,
    credito: `Foto: ${foto.user?.name ?? "Unsplash"} / Unsplash`,
    // regra de atribuição do Unsplash: link pro perfil do fotógrafo com utm do app
    link: `${foto.user?.links?.html ?? "https://unsplash.com"}?utm_source=vitrine&utm_medium=referral`,
  };
}

async function buscarFoto(q: string, usados: Set<string>) {
  if (UNSPLASH) {
    const f = await buscarUnsplash(q, usados);
    if (f || !PEXELS) return f;
  }
  return await buscarPexels(q, usados);
}

async function buscarPexels(q: string, usados: Set<string>) {
  const u = new URL("https://api.pexels.com/v1/search");
  u.searchParams.set("query", q);
  u.searchParams.set("orientation", "portrait");
  u.searchParams.set("size", "large");          // só fotos grandes (alta resolução)
  u.searchParams.set("per_page", "10");
  const r = await fetch(u, { headers: { Authorization: PEXELS! } });
  if (!r.ok) throw new HttpError(502, "Banco de fotos indisponível (" + r.status + ").");
  const d = await r.json();
  // deno-lint-ignore no-explicit-any
  const foto = (d.photos ?? []).find((p: any) => !usados.has("p" + p.id) && !usados.has(base(p.src.original)) && p.width >= 1080);
  if (!foto) return null;
  usados.add("p" + foto.id);
  // "large2x" = ~1880px de largura, comprimida pra web; recortamos 4:5 no app
  return { url: foto.src.large2x || foto.src.original, credito: `Foto: ${foto.photographer} / Pexels`, link: foto.url };
}

Deno.serve(handle(async (req) => {
  await requireUser(req);
  if (!UNSPLASH && !PEXELS) throw new HttpError(500, "Chave do banco de fotos (UNSPLASH_ACCESS_KEY) não configurada no servidor.");
  const { contexto = "", slides, termos: termosDoCorretor, excluir = [] } = await req.json();
  if (!Array.isArray(slides) || !slides.length || slides.length > 10) throw new HttpError(400, "Envie de 1 a 10 slides.");

  const termos: string[] = Array.isArray(termosDoCorretor) && termosDoCorretor.length === slides.length
    ? termosDoCorretor.map((t: unknown) => String(t).slice(0, 80))
    : await termosDeBusca(String(contexto), slides);
  const usados = new Set<string>((Array.isArray(excluir) ? excluir : []).map((u: unknown) => base(String(u))));
  const imagens = [];
  for (const q of termos) {
    let foto = await buscarFoto(q, usados);
    if (!foto) foto = await buscarFoto(q.split(" ").slice(0, 2).join(" ") || "real estate", usados); // busca mais ampla
    imagens.push(foto ? { ...foto, termo: q } : null);
  }
  return json({ imagens });
}));
