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
        // deno-lint-ignore no-explicit-any
        const inv = event.data.object as any;
        // API nova (2025-03+): a assinatura fica em parent.subscription_details; API antiga: inv.subscription
        const subId = inv.subscription ?? inv.parent?.subscription_details?.subscription;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(typeof subId === "string" ? subId : subId.id);
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

// API nova (2025-03+) move current_period_end para os itens da assinatura
// deno-lint-ignore no-explicit-any
function fimDoPeriodo(sub: any): string | null {
  const t = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
  return t ? new Date(t * 1000).toISOString() : null;
}

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
    data_fim: fimDoPeriodo(sub),
  };
  if (sessionId) campos.stripe_checkout_session_id = sessionId;

  // reaproveita a linha atual do corretor (trial ou ativa); se não houver, cria
  const { data: atual } = await db.from("assinaturas").select("id, status, data_inicio")
    .eq("corretor_id", corretor_id).in("status", ["trial", "ativa", "inadimplente"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (atual) {
    if (atual.status === "trial") campos.data_inicio = new Date().toISOString();
    campos.equipe_id = null;   // quem paga a própria assinatura não depende de equipe
    const { error } = await db.from("assinaturas").update(campos).eq("id", atual.id);
    if (error) throw error;
  } else {
    const { error } = await db.from("assinaturas").insert({ ...campos, data_inicio: new Date().toISOString() });
    if (error) throw error;
  }
  await sincronizarEquipe(db, corretor_id, plano_id, periodo, fimDoPeriodo(sub));
}

// Planos de imobiliária: cria/atualiza a equipe do dono e estende o acesso dos corretores convidados
// deno-lint-ignore no-explicit-any
async function sincronizarEquipe(db: any, donoId: string, planoId: string, periodo: string, dataFim: string | null) {
  const { data: plano } = await db.from("planos").select("id, nome, tipo, max_corretores").eq("id", planoId).maybeSingle();
  const { data: equipe } = await db.from("equipes").select("*").eq("dono_id", donoId).maybeSingle();
  if (!plano || plano.tipo !== "equipe") {
    if (equipe?.ativa) await desativarEquipe(db, equipe);   // trocou pra plano individual
    return;
  }
  let eq = equipe;
  if (!eq) {
    const { data: perfil } = await db.from("profiles").select("nome").eq("id", donoId).maybeSingle();
    const { data: nova, error } = await db.from("equipes").insert({
      dono_id: donoId, nome: perfil?.nome ? `Equipe ${perfil.nome}` : "Minha imobiliária",
      plano_id: plano.id, max_corretores: plano.max_corretores, ativa: true,
    }).select("*").single();
    if (error) throw error;
    eq = nova;
  } else {
    await db.from("equipes").update({ plano_id: plano.id, max_corretores: plano.max_corretores, ativa: true }).eq("id", eq.id);
  }
  // corretores que já aceitaram o convite: renova (ou devolve) o acesso com a mesma data do dono
  const { data: membros } = await db.from("equipe_membros").select("corretor_id").eq("equipe_id", eq.id).eq("status", "ativo");
  for (const m of membros ?? []) {
    if (!m.corretor_id) continue;
    const { data: atual } = await db.from("assinaturas").select("id, status, equipe_id, stripe_subscription_id")
      .eq("corretor_id", m.corretor_id).in("status", ["trial", "ativa"]).maybeSingle();
    if (atual?.stripe_subscription_id) continue;           // ele paga a própria assinatura
    if (atual && atual.equipe_id === eq.id) {
      await db.from("assinaturas").update({ status: "ativa", plano_id: plano.id, periodo, data_fim: dataFim }).eq("id", atual.id);
      continue;
    }
    if (atual) await db.from("assinaturas").update({ status: "cancelada", data_fim: new Date().toISOString() }).eq("id", atual.id);
    await db.from("assinaturas").insert({ corretor_id: m.corretor_id, status: "ativa", plano_id: plano.id, periodo,
      data_inicio: new Date().toISOString(), data_fim: dataFim, equipe_id: eq.id });
  }
}

// assinatura da imobiliária acabou: os convidados voltam ao teste grátis (continuam na equipe, voltam se o dono reassinar)
// deno-lint-ignore no-explicit-any
async function desativarEquipe(db: any, equipe: any) {
  await db.from("equipes").update({ ativa: false }).eq("id", equipe.id);
  const { data: rows } = await db.from("assinaturas").select("id, corretor_id").eq("equipe_id", equipe.id).eq("status", "ativa");
  for (const r of rows ?? []) {
    await db.from("assinaturas").update({ status: "cancelada", data_fim: new Date().toISOString() }).eq("id", r.id);
    await db.from("assinaturas").insert({ corretor_id: r.corretor_id, status: "trial", data_inicio: new Date().toISOString() });
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
  const { data: equipe } = await db.from("equipes").select("*").eq("dono_id", row.corretor_id).maybeSingle();
  if (equipe?.ativa) await desativarEquipe(db, equipe);
}
