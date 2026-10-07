// POST { plano_id, periodo: "mensal" | "anual" } → { url }
// Cria uma Checkout Session (assinatura recorrente em BRL) e devolve a URL hospedada do Stripe.
// O preço vem da tabela `planos` no servidor — o cliente nunca manda valor.
import Stripe from "npm:stripe@17";
import { admin, APP_URL, handle, HttpError, json, requireUser } from "../_shared/util.ts";

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

  // Oferta de lançamento: 30% off só no 1º mês do plano mensal, até 31/10/2026 23:59 (horário de Brasília)
  const PROMO_FIM = Date.parse("2026-10-31T23:59:59-03:00");
  let discounts: { coupon: string }[] | undefined;
  if (periodo === "mensal" && Date.now() < PROMO_FIM) {
    const COUPON = "LANCAMENTO30";
    try { await stripe.coupons.retrieve(COUPON); }
    catch { await stripe.coupons.create({ id: COUPON, percent_off: 30, duration: "once", name: "Lançamento 30% off no 1º mês" }); }
    discounts = [{ coupon: COUPON }];
  }

  const session = await stripe.checkout.sessions.create({
    ...(discounts ? { discounts } : {}),
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
