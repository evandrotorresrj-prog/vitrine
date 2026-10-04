// POST (logado) { carrossel_id, legenda? } → { media_id, permalink }
// Publica o carrossel no Instagram do corretor. Cada slide precisa ter `render_url` (JPEG público).
// Regras do Instagram: 2 a 10 imagens, JPEG, proporção entre 4:5 e 1.91:1.
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


const GRAPH = "https://graph.instagram.com/v21.0";

async function ig(path: string, params: Record<string, string>, method = "POST") {
  const body = new URLSearchParams(params);
  const res = method === "POST"
    ? await fetch(`${GRAPH}/${path}`, { method, body })
    : await fetch(`${GRAPH}/${path}?${body}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new HttpError(502, "Instagram: " + (data.error?.message ?? res.statusText));
  return data;
}

async function aguardarPronto(id: string, token: string) {
  for (let i = 0; i < 20; i++) {
    const s = await ig(id, { fields: "status_code", access_token: token }, "GET");
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new HttpError(502, "Instagram rejeitou uma imagem.");
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new HttpError(504, "Instagram demorou demais pra processar as imagens.");
}

Deno.serve(handle(async (req) => {
  const uid = await requireUser(req);
  const { carrossel_id, legenda } = await req.json();
  const db = admin();

  const { data: car } = await db.from("carrosseis").select("*, slides(*)").eq("id", carrossel_id).eq("corretor_id", uid).single();
  if (!car) throw new HttpError(404, "Carrossel não encontrado.");
  const { data: conta } = await db.from("instagram_contas").select("*").eq("corretor_id", uid).eq("status", "ativo").maybeSingle();
  const { data: tok } = await db.from("instagram_tokens").select("*").eq("corretor_id", uid).maybeSingle();
  if (!conta || !tok) throw new HttpError(400, "Conecte o Instagram antes de publicar.");

  // renova o token se faltar menos de 7 dias
  let token = tok.access_token as string;
  if (tok.expires_at && new Date(tok.expires_at).getTime() - Date.now() < 7 * 86_400_000) {
    const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
    const d = await r.json();
    if (r.ok && d.access_token) {
      token = d.access_token;
      const exp = new Date(Date.now() + d.expires_in * 1000).toISOString();
      await db.from("instagram_tokens").update({ access_token: token, expires_at: exp, updated_at: new Date().toISOString() }).eq("corretor_id", uid);
      await db.from("instagram_contas").update({ token_expires_at: exp }).eq("corretor_id", uid);
    }
  }

  const slides = (car.slides ?? []).sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem);
  const imagens: string[] = slides.map((s: { render_url?: string }) => s.render_url).filter(Boolean);
  if (imagens.length !== slides.length) throw new HttpError(400, "Os slides ainda não foram renderizados como imagem.");
  if (imagens.length < 2 || imagens.length > 10) throw new HttpError(400, "O Instagram aceita de 2 a 10 slides.");

  const igId = conta.instagram_business_id as string;
  try {
    // 1) um container por imagem
    const filhos: string[] = [];
    for (const image_url of imagens) {
      const c = await ig(`${igId}/media`, { image_url, is_carousel_item: "true", access_token: token });
      filhos.push(c.id);
    }
    for (const id of filhos) await aguardarPronto(id, token);

    // 2) container do carrossel
    const caption = (legenda ?? car.legenda ?? "").slice(0, 2200);
    const pai = await ig(`${igId}/media`, { media_type: "CAROUSEL", children: filhos.join(","), caption, access_token: token });
    await aguardarPronto(pai.id, token);

    // 3) publica
    const pub = await ig(`${igId}/media_publish`, { creation_id: pai.id, access_token: token });
    const info = await ig(pub.id, { fields: "permalink", access_token: token }, "GET");

    const agora = new Date().toISOString();
    await db.from("carrosseis").update({
      status: "publicado", data_publicada: agora, instagram_media_id: pub.id, instagram_permalink: info.permalink, erro_publicacao: null,
    }).eq("id", carrossel_id);
    return json({ media_id: pub.id, permalink: info.permalink, data_publicada: agora });
  } catch (e) {
    await db.from("carrosseis").update({ erro_publicacao: (e as Error).message }).eq("id", carrossel_id);
    throw e;
  }
}));
