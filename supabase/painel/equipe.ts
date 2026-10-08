// equipe — planos para imobiliárias.
// POST (logado) { acao, ... }
//   "minha"                    → { papel: "dono"|"membro"|null, equipe, membros? }
//   "convidar"  { email }      → dono convida um corretor; devolve o link de convite
//   "remover"   { membro_id }  → dono remove um corretor (ou cancela um convite)
//   "renomear"  { nome }       → dono muda o nome da equipe
//   "aceitar"   { token }      → corretor logado entra na equipe (o e-mail precisa ser o do convite)
//   "sair"                     → corretor sai da equipe
// O acesso do corretor convidado é uma linha em `assinaturas` (status 'ativa', equipe_id), com a mesma data_fim
// da assinatura do dono. O stripe-webhook mantém isso em dia na renovação e no cancelamento.
// Configuração no painel: "Verify JWT with legacy secret" igual às outras funções (o login é validado no código).
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const APP_URL = Deno.env.get("APP_URL") ?? "https://vitrinecorretores.github.io/";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";
const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}
const emailOk = (e: string) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const linkDe = (token: string) => `${APP_URL}?convite=${token}`;
const novoToken = () => crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

// assinatura ativa do dono (a que paga a equipe)
async function assinaturaDoDono(db: SupabaseClient, donoId: string) {
  const { data } = await db.from("assinaturas").select("id, plano_id, periodo, data_fim, status")
    .eq("corretor_id", donoId).eq("status", "ativa").is("equipe_id", null).maybeSingle();
  return data;
}

// dá acesso ao corretor: cancela o teste grátis dele e cria a linha 'ativa' ligada à equipe
// deno-lint-ignore no-explicit-any
async function liberarAcesso(db: SupabaseClient, equipe: any, corretorId: string) {
  const dono = await assinaturaDoDono(db, equipe.dono_id);
  if (!dono) throw new HttpError(409, "A assinatura da imobiliária não está ativa.");
  const { data: atual } = await db.from("assinaturas").select("id, status, equipe_id, stripe_subscription_id")
    .eq("corretor_id", corretorId).in("status", ["trial", "ativa"]).maybeSingle();
  if (atual?.status === "ativa" && atual.stripe_subscription_id) throw new HttpError(409, "Você já tem uma assinatura própria ativa. Cancele ela em Plano antes de entrar na equipe.");
  if (atual?.status === "ativa" && atual.equipe_id && atual.equipe_id !== equipe.id) throw new HttpError(409, "Você já faz parte de outra equipe.");
  if (atual && atual.equipe_id === equipe.id) {
    await db.from("assinaturas").update({ status: "ativa", plano_id: dono.plano_id, periodo: dono.periodo, data_fim: dono.data_fim }).eq("id", atual.id);
    return;
  }
  if (atual) await db.from("assinaturas").update({ status: "cancelada", data_fim: new Date().toISOString() }).eq("id", atual.id);
  const { error } = await db.from("assinaturas").insert({
    corretor_id: corretorId, status: "ativa", plano_id: dono.plano_id, periodo: dono.periodo,
    data_inicio: new Date().toISOString(), data_fim: dono.data_fim, equipe_id: equipe.id,
  });
  if (error) throw error;
}

// tira o acesso de equipe do corretor e devolve ele ao teste grátis
async function retirarAcesso(db: SupabaseClient, equipeId: string, corretorId: string) {
  const { data: row } = await db.from("assinaturas").select("id").eq("corretor_id", corretorId)
    .eq("equipe_id", equipeId).eq("status", "ativa").maybeSingle();
  if (!row) return;
  await db.from("assinaturas").update({ status: "cancelada", data_fim: new Date().toISOString() }).eq("id", row.id);
  await db.from("assinaturas").insert({ corretor_id: corretorId, status: "trial", data_inicio: new Date().toISOString() });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = admin();
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u, error: ue } = await db.auth.getUser(token);
    if (ue || !u?.user) throw new HttpError(401, "Não autenticado.");
    const uid = u.user.id, meuEmail = (u.user.email ?? "").toLowerCase();
    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao ?? "minha");

    const { data: minhaEquipe } = await db.from("equipes").select("*, planos(nome)").eq("dono_id", uid).maybeSingle();

    if (acao === "minha") {
      if (minhaEquipe) {
        const { data: membros } = await db.from("equipe_membros").select("id, email, status, corretor_id, created_at, aceito_em, token")
          .eq("equipe_id", minhaEquipe.id).neq("status", "removido").order("created_at");
        const ids = (membros ?? []).map((m) => m.corretor_id).filter(Boolean);
        const { data: perfis } = ids.length ? await db.from("profiles").select("id, nome").in("id", ids) : { data: [] };
        const { data: cars } = ids.length ? await db.from("carrosseis").select("corretor_id").in("corretor_id", ids) : { data: [] };
        const nomeDe = new Map((perfis ?? []).map((p) => [p.id, p.nome]));
        const contagem = new Map<string, number>();
        for (const c of cars ?? []) contagem.set(c.corretor_id, (contagem.get(c.corretor_id) ?? 0) + 1);
        return json({
          papel: "dono",
          equipe: { nome: minhaEquipe.nome ?? "", ativa: minhaEquipe.ativa, max: minhaEquipe.max_corretores, plano: minhaEquipe.planos?.nome ?? "" },
          membros: (membros ?? []).map((m) => ({
            id: m.id, email: m.email, status: m.status, nome: m.corretor_id ? nomeDe.get(m.corretor_id) ?? "" : "",
            carrosseis: m.corretor_id ? contagem.get(m.corretor_id) ?? 0 : 0, aceito_em: m.aceito_em,
            link: m.status === "convidado" ? linkDe(m.token) : null,
          })),
        });
      }
      const { data: m } = await db.from("equipe_membros").select("equipe_id, equipes(nome, dono_id, ativa)").eq("corretor_id", uid).eq("status", "ativo").maybeSingle();
      if (m) {
        // deno-lint-ignore no-explicit-any
        const eq: any = m.equipes;
        const { data: dono } = await db.from("profiles").select("nome").eq("id", eq?.dono_id).maybeSingle();
        return json({ papel: "membro", equipe: { nome: eq?.nome ?? "", dono: dono?.nome ?? "", ativa: !!eq?.ativa } });
      }
      return json({ papel: null });
    }

    if (acao === "aceitar") {
      const t = String(body.token ?? "");
      if (!/^[a-f0-9]{64}$/.test(t)) throw new HttpError(400, "Convite inválido.");
      const { data: conv } = await db.from("equipe_membros").select("*, equipes(*)").eq("token", t).maybeSingle();
      if (!conv || conv.status === "removido") throw new HttpError(404, "Esse convite não existe mais. Peça um novo para a imobiliária.");
      if (conv.status === "ativo") {
        if (conv.corretor_id === uid) return json({ ok: true, ja: true });
        throw new HttpError(409, "Esse convite já foi usado.");
      }
      if (conv.email.toLowerCase() !== meuEmail) throw new HttpError(403, `Esse convite é para ${conv.email}. Entre na Vitrine com esse e-mail para aceitar.`);
      if (conv.equipes.dono_id === uid) throw new HttpError(400, "Você é o dono dessa equipe.");
      if (!conv.equipes.ativa) throw new HttpError(409, "A assinatura da imobiliária não está ativa no momento.");
      await liberarAcesso(db, conv.equipes, uid);
      await db.from("equipe_membros").update({ status: "ativo", corretor_id: uid, aceito_em: new Date().toISOString() }).eq("id", conv.id);
      return json({ ok: true, equipe: conv.equipes.nome ?? "" });
    }

    if (acao === "sair") {
      const { data: m } = await db.from("equipe_membros").select("id, equipe_id").eq("corretor_id", uid).eq("status", "ativo").maybeSingle();
      if (!m) throw new HttpError(404, "Você não faz parte de nenhuma equipe.");
      await retirarAcesso(db, m.equipe_id, uid);
      await db.from("equipe_membros").update({ status: "removido" }).eq("id", m.id);
      return json({ ok: true });
    }

    // daqui pra baixo: só o dono
    if (!minhaEquipe) throw new HttpError(403, "Você não tem um plano de imobiliária.");

    if (acao === "renomear") {
      const nome = String(body.nome ?? "").trim().slice(0, 80);
      await db.from("equipes").update({ nome }).eq("id", minhaEquipe.id);
      return json({ ok: true });
    }

    if (acao === "convidar") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!emailOk(email)) throw new HttpError(400, "E-mail inválido.");
      if (email === meuEmail) throw new HttpError(400, "Você já faz parte da equipe como dono.");
      if (!minhaEquipe.ativa) throw new HttpError(409, "A assinatura da imobiliária não está ativa.");
      const { count } = await db.from("equipe_membros").select("id", { count: "exact", head: true })
        .eq("equipe_id", minhaEquipe.id).in("status", ["convidado", "ativo"]);
      if ((count ?? 0) + 1 >= minhaEquipe.max_corretores) throw new HttpError(409, `Seu plano tem ${minhaEquipe.max_corretores} vagas e todas estão ocupadas. Remova alguém ou mude de plano.`);
      const { data: ja } = await db.from("equipe_membros").select("id, token, status").eq("equipe_id", minhaEquipe.id).ilike("email", email).neq("status", "removido").maybeSingle();
      if (ja) return json({ ok: true, link: ja.status === "convidado" ? linkDe(ja.token) : null, ja: true });
      const tk = novoToken();
      const { error } = await db.from("equipe_membros").insert({ equipe_id: minhaEquipe.id, email, token: tk });
      if (error) throw error;
      return json({ ok: true, link: linkDe(tk) });
    }

    if (acao === "remover") {
      const { data: m } = await db.from("equipe_membros").select("id, status, corretor_id").eq("id", String(body.membro_id ?? "")).eq("equipe_id", minhaEquipe.id).maybeSingle();
      if (!m) throw new HttpError(404, "Corretor não encontrado na sua equipe.");
      if (m.status === "ativo" && m.corretor_id) await retirarAcesso(db, minhaEquipe.id, m.corretor_id);
      await db.from("equipe_membros").update({ status: "removido" }).eq("id", m.id);
      return json({ ok: true });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    return json({ error: e instanceof HttpError ? e.message : "Erro interno. Tente de novo em instantes." }, e instanceof HttpError ? e.status : 500);
  }
});
