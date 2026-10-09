// POST (logado) { contexto?, slides: [{ titulo, corpo }], termos?: string[], excluir?: string[] }
//   → { imagens: [{ url, credito, link } | null] }
// termos  = busca escolhida pelo corretor (pula a IA); excluir = URLs de fotos que ele já viu (pra "trocar foto")
// Busca FOTOS REAIS em alta resolução em bancos de fotos profissionais com licença livre pra uso comercial:
// Unsplash (principal) e Pexels (reserva, se houver chave). Guardamos o nome do fotógrafo como crédito.
// A IA (Claude) só escolhe as palavras de busca de cada slide.
// Secrets: UNSPLASH_ACCESS_KEY (grátis em unsplash.com/developers) e/ou PEXELS_API_KEY; ANTHROPIC_API_KEY (já existe)
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

// ---- utilitários (copiados de _shared/util.ts) ----
const APP_URL = Deno.env.get("APP_URL") ?? "https://evandrotorresrj-prog.github.io/vitrine/";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/** Cliente com service role (ignora RLS) — só usar no servidor. */
function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** Valida o JWT do usuário logado e devolve o id dele. */
async function requireUser(req: Request): Promise<string> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Não autenticado.");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Sessão inválida.");
  return data.user.id;
}

class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try { return await fn(req); }
    catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      console.error(e);
      return json({ error: e instanceof HttpError ? e.message : "Erro interno. Tente de novo em instantes." }, status);  // não vaza detalhes internos
    }
  };
}
// ---- fim dos utilitários ----


const UNSPLASH = Deno.env.get("UNSPLASH_ACCESS_KEY");
const PEXELS = Deno.env.get("PEXELS_API_KEY");
const ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY");
const BUSCAS_POR_HORA = 60;

type Slide = { titulo?: string; corpo?: string };

// fotos reais de Fortaleza-CE pra variar os carrosséis (o corretor atua lá)
const LUGARES_FORTALEZA = [
  "Fortaleza Beira Mar", "Fortaleza skyline", "Praia de Iracema Fortaleza", "Meireles Fortaleza",
  "Ponte dos Ingleses Fortaleza", "Praia do Futuro Fortaleza", "Fortaleza Ceara buildings", "Fortaleza sunset beach",
  "Mucuripe Fortaleza", "Dragao do Mar Fortaleza", "Fortaleza aerial view", "Fortaleza Ceara coast",
  "Cumbuco Ceara", "Porto das Dunas Ceara", "Fortaleza night city", "Ceara beach coconut trees",
];
// quantas fotos já usadas pelo corretor ficam "proibidas" (pra não repetir entre carrosséis diferentes)
const MEMORIA_FOTOS = 400;
const ehFortaleza = (q: string) => /fortaleza|cear[aá]|iracema|meireles|mucuripe|aldeota/i.test(q);
// escolhe uma foto aleatória entre as boas (não sempre a 1ª) pra não repetir as mesmas imagens
// deno-lint-ignore no-explicit-any
function sortear<T>(lista: T[]): T | undefined { return lista.length ? lista[Math.floor(Math.random() * lista.length)] : undefined; }
// página aleatória dos resultados (1 a 3): a mesma busca devolve fotos diferentes a cada vez
const paginaAleatoria = () => 1 + Math.floor(Math.random() * 3);

// pede ao Claude 1 busca curta em inglês por slide (fotos de banco de imagem respondem melhor em inglês)
async function termosDeBusca(contexto: string, slides: Slide[]): Promise<string[]> {
  const fallback = slides.map((s, i) => i % 2 === 1
    ? LUGARES_FORTALEZA[(i + Math.floor(Math.random() * LUGARES_FORTALEZA.length)) % LUGARES_FORTALEZA.length]
    : (`${contexto} ${s.titulo ?? ""}`.trim().slice(0, 80) || "modern apartment brazil"));
  if (!ANTHROPIC) return fallback;
  try {
    const lista = slides.map((s, i) => `${i + 1}. ${s.titulo ?? ""} — ${(s.corpo ?? "").slice(0, 160)}`).join("\n");
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",   // escolher palavras de busca é tarefa simples: Haiku custa ~3x menos
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `Você escolhe fotos REAIS de banco de imagens para um carrossel de Instagram de um corretor de imóveis no Brasil.
Contexto: ${contexto || "mercado imobiliário"}
Slides:
${lista}

Para cada slide, escreva UMA busca curta (2 a 5 palavras) que traga uma foto real, relacionada ao assunto do slide e com IMPACTO VISUAL de post viral:
luz dramática ou golden hour, alto contraste, cores vivas, enquadramentos marcantes (vista aérea, drone, grande angular, detalhe de perto),
imóveis de alto padrão, varandas com vista, piscinas, skyline, chaves e contratos em close. Nada de foto genérica de banco de imagem com cara de propaganda.
Na CAPA (slide 1), escolha a imagem mais chamativa de todas — ela precisa parar o scroll.
O corretor atua em FORTALEZA, CEARÁ. Diversifique: em cerca de METADE dos slides (alternando, nunca dois seguidos iguais), use fotos reais de Fortaleza,
sempre com a palavra "Fortaleza" na busca e variando o lugar — ex.: "Fortaleza Beira Mar", "Fortaleza skyline", "Praia de Iracema Fortaleza",
"Meireles Fortaleza", "Fortaleza Ceara buildings", "Ponte dos Ingleses Fortaleza", "Praia do Futuro Fortaleza", "Dragao do Mar Fortaleza", "Fortaleza sunset beach".
Nos outros slides use buscas em INGLÊS ligadas ao assunto (ex.: "modern apartment living room", "house keys handover", "couple signing contract", "beach view balcony").
Não repita a mesma busca em dois slides e fuja do óbvio: varie ângulo, ambiente, hora do dia e estilo (ex.: em vez de só "modern apartment",
use "minimalist kitchen morning light", "cozy balcony plants sunset", "aerial view residential towers", "architect blueprint desk").
Evite pessoas olhando pra câmera e evite qualquer coisa com texto. Código de variedade desta busca: ${Math.random().toString(36).slice(2, 7)}.
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

async function buscarUnsplash(q: string, usados: Set<string>, pagina = paginaAleatoria()): Promise<Foto | null> {
  const u = new URL("https://api.unsplash.com/search/photos");
  u.searchParams.set("page", String(pagina));
  u.searchParams.set("query", q);
  if (!ehFortaleza(q)) u.searchParams.set("orientation", "portrait");   // Fortaleza tem menos fotos: aceita horizontal (o recorte 4:5 é feito pela CDN)
  u.searchParams.set("content_filter", "high");
  u.searchParams.set("per_page", "30");
  const r = await fetch(u, { headers: { Authorization: `Client-ID ${UNSPLASH}`, "Accept-Version": "v1" } });
  if (!r.ok) throw new HttpError(502, "Banco de fotos indisponível (" + r.status + ").");
  const d = await r.json();
  // deno-lint-ignore no-explicit-any
  const foto = sortear((d.results ?? []).filter((p: any) => !usados.has("u" + p.id) && !usados.has(base(p.urls.raw)) && p.width >= 1080));
  if (!foto) return pagina > 1 ? await buscarUnsplash(q, usados, 1) : null;
  usados.add("u" + foto.id);
  // regra da API do Unsplash: avisar o "download" quando a foto é escolhida pra uso
  fetch(foto.links.download_location, { headers: { Authorization: `Client-ID ${UNSPLASH}` } }).catch(() => {});
  // já recortada em 4:5 e 1080x1350 (alta resolução, tamanho exato do Instagram) pela CDN do Unsplash
  return {
    id: "u" + foto.id,
    url: `${foto.urls.raw}&w=1080&h=1350&fit=crop&crop=entropy&q=85&fm=jpg`,
    credito: `Foto: ${foto.user?.name ?? "Unsplash"} / Unsplash`,
    // regra de atribuição do Unsplash: link pro perfil do fotógrafo com utm do app
    link: `${foto.user?.links?.html ?? "https://unsplash.com"}?utm_source=vitrine&utm_medium=referral`,
  };
}

type Foto = { id: string; url: string; credito: string; link: string };
// com os dois bancos configurados, sorteia qual tentar primeiro (dobra o acervo e reduz repetição)
async function buscarFoto(q: string, usados: Set<string>): Promise<Foto | null> {
  const ordem: ("u" | "p")[] = [];
  if (UNSPLASH) ordem.push("u");
  if (PEXELS) ordem.push("p");
  if (ordem.length === 2 && Math.random() < 0.5) ordem.reverse();
  for (const b of ordem) {
    try {
      const f = b === "u" ? await buscarUnsplash(q, usados) : await buscarPexels(q, usados);
      if (f) return f;
    } catch (e) { console.error("banco", b, e); }
  }
  return null;
}

async function buscarPexels(q: string, usados: Set<string>, pagina = paginaAleatoria()): Promise<Foto | null> {
  const u = new URL("https://api.pexels.com/v1/search");
  u.searchParams.set("page", String(pagina));
  u.searchParams.set("query", q);
  if (!ehFortaleza(q)) u.searchParams.set("orientation", "portrait");
  u.searchParams.set("size", "large");          // só fotos grandes (alta resolução)
  u.searchParams.set("per_page", "30");
  const r = await fetch(u, { headers: { Authorization: PEXELS! } });
  if (!r.ok) throw new HttpError(502, "Banco de fotos indisponível (" + r.status + ").");
  const d = await r.json();
  // deno-lint-ignore no-explicit-any
  const foto = sortear((d.photos ?? []).filter((p: any) => !usados.has("p" + p.id) && !usados.has(base(p.src.original)) && p.width >= 1080));
  if (!foto) return pagina > 1 ? await buscarPexels(q, usados, 1) : null;
  usados.add("p" + foto.id);
  // "large2x" = ~1880px de largura, comprimida pra web; recortamos 4:5 no app
  return { id: "p" + foto.id, url: foto.src.large2x || foto.src.original, credito: `Foto: ${foto.photographer} / Pexels`, link: foto.url };
}

Deno.serve(handle(async (req) => {
  const uid = await requireUser(req);
  // segurança/custo: só quem tem teste grátis ou plano ativo, e no máximo BUSCAS_POR_HORA chamadas por hora
  const db = admin();
  const { data: plano } = await db.from("assinaturas").select("status").eq("corretor_id", uid).in("status", ["trial", "ativa"]).maybeSingle();
  if (!plano) throw new HttpError(402, "Você não tem um plano ativo.");
  const umaHora = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await db.from("buscas_imagens_log").select("id", { count: "exact", head: true }).eq("corretor_id", uid).gte("created_at", umaHora);
  if ((count ?? 0) >= BUSCAS_POR_HORA) throw new HttpError(429, "Muitas buscas de foto em pouco tempo. Espere um pouco e tente de novo.");
  await db.from("buscas_imagens_log").insert({ corretor_id: uid });
  if (!UNSPLASH && !PEXELS) throw new HttpError(500, "Chave do banco de fotos (UNSPLASH_ACCESS_KEY) não configurada no servidor.");
  const { contexto = "", slides, termos: termosDoCorretor, excluir = [] } = await req.json();
  if (!Array.isArray(slides) || !slides.length || slides.length > 10) throw new HttpError(400, "Envie de 1 a 10 slides.");

  const termos: string[] = Array.isArray(termosDoCorretor) && termosDoCorretor.length === slides.length
    ? termosDoCorretor.map((t: unknown) => String(t).slice(0, 80))
    : await termosDeBusca(String(contexto), slides);
  const usados = new Set<string>((Array.isArray(excluir) ? excluir : []).map((u: unknown) => base(String(u))));
  // fotos que esse corretor já usou em outros carrosséis não voltam (até MEMORIA_FOTOS mais recentes)
  const { data: jaUsadas } = await db.from("fotos_usadas").select("foto_id").eq("corretor_id", uid)
    .order("created_at", { ascending: false }).limit(MEMORIA_FOTOS);
  for (const r of jaUsadas ?? []) usados.add(r.foto_id);
  const imagens = [];
  const escolhidas: string[] = [];
  for (const q of termos) {
    let foto = await buscarFoto(q, usados);
    if (!foto && ehFortaleza(q)) foto = await buscarFoto("Fortaleza Brazil", usados);           // Fortaleza genérica
    if (!foto) foto = await buscarFoto(q.split(" ").slice(0, 2).join(" ") || "real estate", usados); // busca mais ampla
    if (foto) escolhidas.push(foto.id);
    imagens.push(foto ? { url: foto.url, credito: foto.credito, link: foto.link, termo: q } : null);
  }
  // grava as escolhidas (pelo id do banco de fotos) pra não repetir nos próximos carrosséis
  if (escolhidas.length) {
    const { error: eu } = await db.from("fotos_usadas").insert(escolhidas.map((foto_id) => ({ corretor_id: uid, foto_id })));
    if (eu) console.error("fotos_usadas:", eu);
  }
  return json({ imagens });
}));
