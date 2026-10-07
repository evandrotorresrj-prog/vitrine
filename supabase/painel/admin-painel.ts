// admin-painel — lista as contas da Vitrine para o DONO da plataforma.
// POST (logado) {} → { resumo, contas: [...] }
// Segurança: valida o login (JWT) e só responde se o usuário estiver em ADMIN_IDS. Qualquer outro recebe 403.
// Os dados vêm com service role (ignora RLS), por isso a checagem de admin aqui no servidor é obrigatória.
// Configuração no painel: "Verify JWT with legacy secret" DESLIGADO (o login é validado no código, como nas outras funções).
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const ADMIN_IDS = ["f13c2703-8848-485a-ae60-97e139a2b0a6"];   // Evandro (evandrotorresrj@hotmail.com)
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const db = admin();
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u, error } = await db.auth.getUser(token);
    if (error || !u?.user) return json({ error: "Não autenticado." }, 401);
    if (!ADMIN_IDS.includes(u.user.id)) return json({ error: "Acesso restrito." }, 403);

    // contas (Auth) — até 1000 por página
    const users: { id: string; email?: string; created_at: string; last_sign_in_at?: string; email_confirmed_at?: string }[] = [];
    for (let page = 1; page <= 10; page++) {
      const { data, error: e } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (e) throw e;
      users.push(...data.users);
      if (data.users.length < 1000) break;
    }
    const [{ data: perfis }, { data: assin }, { data: planos }, { data: cars }, { data: igs }] = await Promise.all([
      db.from("profiles").select("id, nome, telefone, creci, cidade, trial_usado, trial_limite"),
      db.from("assinaturas").select("corretor_id, status, periodo, plano_id, data_fim, created_at, stripe_subscription_id").order("created_at", { ascending: false }),
      db.from("planos").select("id, nome, preco_mensal, preco_anual"),
      db.from("carrosseis").select("corretor_id, status"),
      db.from("instagram_contas").select("corretor_id, username, status"),
    ]);
    // deno-lint-ignore no-explicit-any
    const porId = <T extends Record<string, any>>(rows: T[] | null, key: string) => {
      const m = new Map<string, T[]>();
      for (const r of rows ?? []) { const k = r[key]; m.set(k, [...(m.get(k) ?? []), r]); }
      return m;
    };
    const perfilDe = new Map((perfis ?? []).map((p) => [p.id, p]));
    const planoDe = new Map((planos ?? []).map((p) => [p.id, p]));
    const assinDe = porId(assin, "corretor_id");
    const carsDe = porId(cars, "corretor_id");
    const igDe = new Map((igs ?? []).map((i) => [i.corretor_id, i]));

    let ativos = 0, trials = 0, receitaMensal = 0;
    const contas = users.map((usr) => {
      const p = perfilDe.get(usr.id);
      const lista = assinDe.get(usr.id) ?? [];
      const atual = lista.find((a) => a.status === "ativa") ?? lista.find((a) => a.status === "trial") ?? lista[0];
      const plano = atual?.plano_id ? planoDe.get(atual.plano_id) : null;
      if (atual?.status === "ativa") {
        ativos++;
        if (plano) receitaMensal += atual.periodo === "anual" ? Number(plano.preco_anual) / 12 : Number(plano.preco_mensal);
      } else if (atual?.status === "trial") trials++;
      const cs = carsDe.get(usr.id) ?? [];
      const ig = igDe.get(usr.id);
      return {
        email: usr.email ?? "",
        nome: p?.nome ?? "",
        telefone: p?.telefone ?? "",
        cidade: p?.cidade ?? "",
        creci: p?.creci ?? "",
        cadastrado_em: usr.created_at,
        ultimo_login: usr.last_sign_in_at ?? null,
        email_confirmado: !!usr.email_confirmed_at,
        status: atual?.status ?? "sem plano",
        plano: plano?.nome ?? (atual?.status === "trial" ? "Teste grátis" : ""),
        periodo: atual?.periodo ?? "",
        fim: atual?.data_fim ?? null,
        pagante: !!atual?.stripe_subscription_id && atual?.status === "ativa",
        trial_usado: p?.trial_usado ?? 0,
        trial_limite: p?.trial_limite ?? 0,
        carrosseis: cs.length,
        publicados: cs.filter((c) => c.status === "publicado").length,
        instagram: ig && ig.status === "ativo" ? "@" + ig.username : "",
      };
    }).sort((a, b) => (b.cadastrado_em || "").localeCompare(a.cadastrado_em || ""));

    const seteDias = Date.now() - 7 * 86_400_000;
    return json({
      resumo: {
        contas: contas.length,
        novas_7_dias: contas.filter((c) => new Date(c.cadastrado_em).getTime() > seteDias).length,
        assinantes_ativos: ativos,
        em_teste: trials,
        receita_mensal_estimada: Math.round(receitaMensal * 100) / 100,
        carrosseis: (cars ?? []).length,
      },
      contas,
    });
  } catch (e) {
    console.error(e);
    return json({ error: "Erro interno. Tente de novo em instantes." }, 500);
  }
});
