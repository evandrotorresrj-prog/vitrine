// POST {} → cancela a assinatura Stripe do usuário logado.
// O banco é atualizado pelo webhook (customer.subscription.deleted); aqui só esperamos e devolvemos o estado novo.
import Stripe from "npm:stripe@17";
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


const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);

Deno.serve(handle(async (req) => {
  const uid = await requireUser(req);
  const db = admin();
  const { data: row } = await db.from("assinaturas").select("id, stripe_subscription_id")
    .eq("corretor_id", uid).in("status", ["ativa", "inadimplente"]).not("stripe_subscription_id", "is", null)
    .maybeSingle();
  if (!row) throw new HttpError(404, "Nenhuma assinatura paga encontrada.");

  await stripe.subscriptions.cancel(row.stripe_subscription_id);

  // aguarda o webhook processar (até ~6s) pra devolver o estado já atualizado
  for (let i = 0; i < 12; i++) {
    const { data: nova } = await db.from("assinaturas").select("*")
      .eq("corretor_id", uid).in("status", ["trial", "ativa"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (nova && nova.status === "trial") return json({ assinatura: nova });
    await new Promise((r) => setTimeout(r, 500));
  }
  return json({ assinatura: null, pendente: true });
}));
