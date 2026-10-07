// Fluxo "Instagram API com login do Instagram" (não exige Página do Facebook — mais simples pro corretor).
// Deploy com --no-verify-jwt (o GET vem do redirect do Instagram, sem token do Supabase).
//
//  POST (logado)  { acao: "iniciar" }      → { url }   URL de autorização do Instagram (com state anti-CSRF)
//  POST (logado)  { acao: "desconectar" }  → { ok }
//  GET  ?code=…&state=…                     → troca code por token, salva, redireciona pro app
//
// Secrets: META_APP_ID, META_APP_SECRET (do produto "Instagram" no app da Meta), APP_URL
// Redirect URI cadastrada no app da Meta = URL desta função:
//   https://qbfmozumntequvecttfs.supabase.co/functions/v1/instagram-oauth-callback
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


const APP_ID = Deno.env.get("META_APP_ID")!;
const APP_SECRET = Deno.env.get("META_APP_SECRET")!;
const REDIRECT = `${Deno.env.get("SUPABASE_URL")}/functions/v1/instagram-oauth-callback`;
const SCOPES = ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_comments"];
const GRAPH = "https://graph.instagram.com/v21.0";

Deno.serve(handle(async (req) => {
  const db = admin();

  if (req.method === "POST") {
    const uid = await requireUser(req);
    const { acao } = await req.json();
    if (acao === "iniciar") {
      const state = crypto.randomUUID();
      await db.from("instagram_oauth_states").insert({ state, corretor_id: uid });
      const u = new URL("https://www.instagram.com/oauth/authorize");
      u.searchParams.set("client_id", APP_ID);
      u.searchParams.set("redirect_uri", REDIRECT);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", SCOPES.join(","));
      u.searchParams.set("state", state);
      return json({ url: u.toString() });
    }
    if (acao === "desconectar") {
      await db.from("instagram_tokens").delete().eq("corretor_id", uid);
      await db.from("instagram_contas").update({ status: "inativo" }).eq("corretor_id", uid);
      return json({ ok: true });
    }
    throw new HttpError(400, "Ação inválida.");
  }

  // ---- GET: retorno do Instagram ----
  const url = new URL(req.url);
  const voltar = (q: string) => Response.redirect(`${APP_URL}?instagram=${q}`, 302);
  if (url.searchParams.get("error")) return voltar("negado");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return voltar("erro");

  const { data: st } = await db.from("instagram_oauth_states").select("*").eq("state", state).maybeSingle();
  if (!st || Date.now() - new Date(st.created_at).getTime() > 15 * 60_000) return voltar("expirado");
  await db.from("instagram_oauth_states").delete().eq("state", state);
  const uid = st.corretor_id as string;

  try {
    // 1) code → token curto
    const form = new URLSearchParams({ client_id: APP_ID, client_secret: APP_SECRET, grant_type: "authorization_code", redirect_uri: REDIRECT, code });
    const r1 = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
    const t1 = await r1.json();
    if (!r1.ok) throw new Error(JSON.stringify(t1));

    // 2) token curto → longo (60 dias)
    const r2 = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${APP_SECRET}&access_token=${t1.access_token}`);
    const t2 = await r2.json();
    if (!r2.ok) throw new Error(JSON.stringify(t2));
    const expires = new Date(Date.now() + (t2.expires_in ?? 5_184_000) * 1000).toISOString();

    // 3) dados da conta
    const r3 = await fetch(`${GRAPH}/me?fields=user_id,username,account_type&access_token=${t2.access_token}`);
    const me = await r3.json();
    if (!r3.ok) throw new Error(JSON.stringify(me));

    await db.from("instagram_tokens").upsert({ corretor_id: uid, access_token: t2.access_token, expires_at: expires, updated_at: new Date().toISOString() });
    await db.from("instagram_contas").upsert({
      corretor_id: uid,
      instagram_business_id: String(me.user_id ?? t1.user_id),
      username: me.username,
      status: "ativo",
      connected_at: new Date().toISOString(),
      token_expires_at: expires,
    }, { onConflict: "corretor_id" });
    return voltar("conectado");
  } catch (e) {
    console.error("oauth instagram:", e);
    return voltar("erro");
  }
}));
