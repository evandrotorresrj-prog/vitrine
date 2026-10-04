// POST {} → cancela a assinatura Stripe do usuário logado.
// O banco é atualizado pelo webhook (customer.subscription.deleted); aqui só esperamos e devolvemos o estado novo.
import Stripe from "npm:stripe@17";
import { admin, handle, HttpError, json, requireUser } from "../_shared/util.ts";

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
