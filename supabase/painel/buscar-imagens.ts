// POST (logado) { contexto?: string, slides: [{ titulo, corpo }] } → { imagens: [{ url, credito, link } | null] }
// Busca FOTOS REAIS em alta resolução (Pexels — licença livre pra uso comercial, sem precisar dar crédito,
// mas guardamos o nome do fotógrafo mesmo assim). A IA (Claude) só escolhe as palavras de busca de cada slide.
// Secrets: PEXELS_API_KEY (grátis em pexels.com/api), ANTHROPIC_API_KEY (já existe)
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
      return json({ error: (e as Error).message ?? "Erro interno." }, status);
    }
  };
}
// ---- fim dos utilitários ----


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

async function buscarFoto(q: string, usados: Set<number>) {
  const u = new URL("https://api.pexels.com/v1/search");
  u.searchParams.set("query", q);
  u.searchParams.set("orientation", "portrait");
  u.searchParams.set("size", "large");          // só fotos grandes (alta resolução)
  u.searchParams.set("per_page", "10");
  const r = await fetch(u, { headers: { Authorization: PEXELS! } });
  if (!r.ok) throw new HttpError(502, "Banco de fotos indisponível (" + r.status + ").");
  const d = await r.json();
  // deno-lint-ignore no-explicit-any
  const foto = (d.photos ?? []).find((p: any) => !usados.has(p.id) && p.width >= 1080);
  if (!foto) return null;
  usados.add(foto.id);
  // "large2x" = ~1880px de largura, comprimida pra web; recortamos 4:5 no app
  return { url: foto.src.large2x || foto.src.original, credito: `Foto: ${foto.photographer} / Pexels`, link: foto.url };
}

Deno.serve(handle(async (req) => {
  await requireUser(req);
  if (!PEXELS) throw new HttpError(500, "PEXELS_API_KEY não configurada no servidor.");
  const { contexto = "", slides } = await req.json();
  if (!Array.isArray(slides) || !slides.length || slides.length > 10) throw new HttpError(400, "Envie de 1 a 10 slides.");

  const termos = await termosDeBusca(String(contexto), slides);
  const usados = new Set<number>();
  const imagens = [];
  for (const q of termos) {
    let foto = await buscarFoto(q, usados);
    if (!foto) foto = await buscarFoto(q.split(" ").slice(0, 2).join(" ") || "real estate", usados); // busca mais ampla
    imagens.push(foto ? { ...foto, termo: q } : null);
  }
  return json({ imagens });
}));
