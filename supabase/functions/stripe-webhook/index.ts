// Endpoint chamado pelo Stripe (sem JWT — deploy com --no-verify-jwt).
// Valida a assinatura do evento com STRIPE_WEBHOOK_SECRET e é a ÚNICA forma de ativar um plano pago.
import Stripe from "npm:stripe@17";
import { admin } from "../_shared/util.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const crypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, Deno.env.get("STRIPE_WEBHOOK_SECRET")!, undefined, crypto);
  } catch (e) {
    return new Response(`Assinatura inválida: ${(e as Error).message}`, { status: 400 });
  }

  const db = admin();
  // idempotência: se já processamos esse evento, só confirma
  const { data: ja } = await db.from("stripe_webhooks").select("processado").eq("id", event.id).maybeSingle();
  if (ja?.processado) return new Response("ok (repetido)");
  await db.from("stripe_webhooks").upsert({ id: event.id, tipo: event.type, payload: event });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.mode !== "subscription" || s.payment_status !== "paid") break;
        const sub = await stripe.subscriptions.retrieve(s.subscription as string);
        await ativar(db, sub, s.id);
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        if (sub.status === "active") await ativar(db, sub);
        else if (["past_due", "unpaid"].includes(sub.status))
          await db.from("assinaturas").update({ status: "inadimplente" }).eq("stripe_subscription_id", sub.id);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await encerrar(db, sub);
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.subscription) {
          const sub = await stripe.subscriptions.retrieve(inv.subscription as string);
          await ativar(db, sub);   // renovação: atualiza data_fim
        }
        break;
      }
    }
    await db.from("stripe_webhooks").update({ processado: true, erro: null }).eq("id", event.id);
    return new Response("ok");
  } catch (e) {
    console.error(e);
    await db.from("stripe_webhooks").update({ erro: (e as Error).message }).eq("id", event.id);
    return new Response("erro", { status: 500 });   // Stripe tenta de novo
  }
});

// deno-lint-ignore no-explicit-any
async function ativar(db: any, sub: Stripe.Subscription, sessionId?: string) {
  const { corretor_id, plano_id, periodo } = sub.metadata;
  if (!corretor_id) throw new Error("subscription sem metadata.corretor_id");
  const campos: Record<string, unknown> = {
    corretor_id,
    plano_id,
    periodo,
    status: "ativa",
    stripe_customer_id: sub.customer as string,
    stripe_subscription_id: sub.id,
    data_fim: new Date(sub.current_period_end * 1000).toISOString(),
  };
  if (sessionId) campos.stripe_checkout_session_id = sessionId;

  // reaproveita a linha atual do corretor (trial ou ativa); se não houver, cria
  const { data: atual } = await db.from("assinaturas").select("id, status, data_inicio")
    .eq("corretor_id", corretor_id).in("status", ["trial", "ativa", "inadimplente"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (atual) {
    if (atual.status === "trial") campos.data_inicio = new Date().toISOString();
    const { error } = await db.from("assinaturas").update(campos).eq("id", atual.id);
    if (error) throw error;
  } else {
    const { error } = await db.from("assinaturas").insert({ ...campos, data_inicio: new Date().toISOString() });
    if (error) throw error;
  }
}

// deno-lint-ignore no-explicit-any
async function encerrar(db: any, sub: Stripe.Subscription) {
  const { data: row } = await db.from("assinaturas").select("id, corretor_id")
    .eq("stripe_subscription_id", sub.id).maybeSingle();
  if (!row) return;
  await db.from("assinaturas").update({ status: "cancelada" }).eq("id", row.id);
  // volta pro teste grátis (mesmo comportamento do cancelamento simulado anterior)
  await db.from("profiles").update({ trial_usado: 0 }).eq("id", row.corretor_id);
  await db.from("assinaturas").insert({ corretor_id: row.corretor_id, status: "trial", data_inicio: new Date().toISOString() });
}
