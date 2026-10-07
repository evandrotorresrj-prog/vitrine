// POST { plano_id, periodo: "mensal" | "anual" } → { url }
// Cria uma Checkout Session (assinatura recorrente em BRL) e devolve a URL hospedada do Stripe.
// O preço vem da tabela `planos` no servidor — o cliente nunca manda valor.
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
  const { plano_id, periodo } = await req.json();
  if (!["mensal", "anual"].includes(periodo)) throw new HttpError(400, "Período inválido.");

  const db = admin();
  const { data: plano } = await db.from("planos").select("*").eq("id", plano_id).single();
  if (!plano) throw new HttpError(404, "Plano não encontrado.");
  const { data: perfil } = await db.from("profiles").select("id, email, nome, stripe_customer_id").eq("id", uid).single();
  if (!perfil) throw new HttpError(404, "Perfil não encontrado.");

  // já tem assinatura paga ativa? não deixa duplicar
  const { data: ativa } = await db.from("assinaturas").select("id")
    .eq("corretor_id", uid).eq("status", "ativa").not("stripe_subscription_id", "is", null).maybeSingle();
  if (ativa) throw new HttpError(409, "Você já tem uma assinatura ativa. Cancele antes de trocar de plano.");

  let customer = perfil.stripe_customer_id as string | null;
  if (!customer) {
    const c = await stripe.customers.create({ email: perfil.email, name: perfil.nome ?? undefined, metadata: { corretor_id: uid } });
    customer = c.id;
    await db.from("profiles").update({ stripe_customer_id: customer }).eq("id", uid);
  }

  const valor = Number(periodo === "anual" ? plano.preco_anual : plano.preco_mensal);
  const meta = { corretor_id: uid, plano_id: String(plano.id), periodo };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    locale: "pt-BR",
    payment_method_types: ["card"],          // assinatura recorrente no BR: cartão
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "brl",
        unit_amount: Math.round(valor * 100),
        recurring: { interval: periodo === "anual" ? "year" : "month" },
        product_data: { name: `Vitrine ${plano.nome} (${periodo})` },
      },
    }],
    metadata: meta,
    subscription_data: { metadata: meta },
    client_reference_id: uid,
    success_url: `${APP_URL}?checkout=sucesso&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}?checkout=cancelado`,
  });

  return json({ url: session.url });
}));
