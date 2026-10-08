// publicar-agendados — roda sozinho a cada 5 minutos (pg_cron + pg_net, ver migração 20261007_agendamento.sql).
// Publica no Instagram (feed/carrossel) todo carrossel com status "agendado" cuja data_agendada já chegou.
// As imagens já foram geradas e enviadas pelo app no momento do agendamento (slides.render_url).
// Não recebe nada do chamador e só age sobre o que os próprios corretores agendaram, então chamar
// esta função antes da hora não publica nada. Uma trava (publicando_em) impede publicar o mesmo post duas vezes.
// Configuração no painel: "Verify JWT" DESLIGADO (o pg_net chama sem login).
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const GRAPH = "https://graph.instagram.com/v21.0";
const LOTE = 5;                 // no máximo 5 carrosséis por execução (cabe no tempo da função)

function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function ig(path: string, params: Record<string, string>, method = "POST") {
  const body = new URLSearchParams(params);
  const res = method === "POST" ? await fetch(`${GRAPH}/${path}`, { method, body }) : await fetch(`${GRAPH}/${path}?${body}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error("Instagram: " + (data.error?.message ?? res.statusText));
  return data;
}
async function aguardarPronto(id: string, token: string, tentativas = 20, espera = 1500) {
  for (let i = 0; i < tentativas; i++) {
    const s = await ig(id, { fields: "status_code", access_token: token }, "GET");
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("O Instagram rejeitou uma imagem.");
    await new Promise((r) => setTimeout(r, espera));
  }
  throw new Error("O Instagram demorou demais para processar as imagens.");
}

// deno-lint-ignore no-explicit-any
async function publicarUm(db: SupabaseClient, car: any) {
  const uid = car.corretor_id as string;
  const { data: conta } = await db.from("instagram_contas").select("*").eq("corretor_id", uid).eq("status", "ativo").maybeSingle();
  const { data: tok } = await db.from("instagram_tokens").select("*").eq("corretor_id", uid).maybeSingle();
  if (!conta || !tok) throw new Error("Instagram não conectado na hora agendada. Conecte na aba Instagram e publique pelo painel.");

  // teste grátis: limite de publicações e link da Vitrine na legenda
  const { data: assinTeste } = await db.from("assinaturas").select("status").eq("corretor_id", uid).in("status", ["trial", "ativa"]).maybeSingle();
  const emTeste = !assinTeste || assinTeste.status === "trial";
  if (emTeste) {
    const { data: perfilTeste } = await db.from("profiles").select("trial_limite").eq("id", uid).maybeSingle();
    const { count: jaPublicados } = await db.from("carrosseis").select("id", { count: "exact", head: true })
      .eq("corretor_id", uid).eq("status", "publicado").not("instagram_media_id", "is", null);
    const limite = perfilTeste?.trial_limite ?? 3;
    if ((jaPublicados ?? 0) >= limite) throw new Error(`O teste grátis permite publicar ${limite} carrosséis e esse limite já foi usado. Assine um plano para continuar publicando.`);
  }

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

  const pasta = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/slides-render/${uid}/`;
  // deno-lint-ignore no-explicit-any
  const slides = (car.slides ?? []).sort((a: any, b: any) => a.ordem - b.ordem);
  // deno-lint-ignore no-explicit-any
  const imagens: string[] = slides.map((s: any) => s.render_url).filter((u: unknown) => typeof u === "string" && (u as string).startsWith(pasta));
  if (imagens.length !== slides.length) throw new Error("As imagens do carrossel não foram geradas. Abra o carrossel no painel e publique.");
  if (imagens.length < 2 || imagens.length > 10) throw new Error("O carrossel do feed precisa ter de 2 a 10 slides.");
  // deno-lint-ignore no-explicit-any
  const LINK_TESTE = "\n\n✨ Criado com a Vitrine — vitrinecorretores.github.io";
  let caption = slides.map((s: any) => s.titulo).filter(Boolean).join(" · ");
  if (emTeste) caption = caption.slice(0, 2200 - LINK_TESTE.length) + LINK_TESTE;
  caption = caption.slice(0, 2200);
  const igId = conta.instagram_business_id as string;

  const filhos: string[] = [];
  for (const image_url of imagens) filhos.push((await ig(`${igId}/media`, { image_url, is_carousel_item: "true", access_token: token })).id);
  for (const id of filhos) await aguardarPronto(id, token);
  const pai = await ig(`${igId}/media`, { media_type: "CAROUSEL", children: filhos.join(","), caption, access_token: token });
  await aguardarPronto(pai.id, token);
  const pub = await ig(`${igId}/media_publish`, { creation_id: pai.id, access_token: token });
  const info = await ig(pub.id, { fields: "permalink", access_token: token }, "GET").catch(() => ({}));
  await db.from("carrosseis").update({
    status: "publicado", data_publicada: new Date().toISOString(), instagram_media_id: pub.id,
    // deno-lint-ignore no-explicit-any
    instagram_permalink: (info as any).permalink ?? null, erro_publicacao: null, publicando_em: null,
  }).eq("id", car.id);
}

Deno.serve(async () => {
  const db = admin();
  const agora = new Date().toISOString();
  const travaVelha = new Date(Date.now() - 15 * 60_000).toISOString();   // trava presa há 15 min = execução que caiu
  const { data: devidos, error } = await db.from("carrosseis").select("id")
    .eq("status", "agendado").lte("data_agendada", agora)
    .or(`publicando_em.is.null,publicando_em.lt.${travaVelha}`)
    .order("data_agendada", { ascending: true }).limit(LOTE);
  if (error) { console.error(error); return json({ error: "Falha ao consultar agendados." }, 500); }

  const resultado: Record<string, string> = {};
  for (const { id } of devidos ?? []) {
    // pega a trava: só uma execução consegue
    const { data: pego } = await db.from("carrosseis").update({ publicando_em: new Date().toISOString() })
      .eq("id", id).eq("status", "agendado").or(`publicando_em.is.null,publicando_em.lt.${travaVelha}`)
      .select("*, slides(*)").maybeSingle();
    if (!pego) continue;
    try {
      await publicarUm(db, pego);
      resultado[id] = "publicado";
    } catch (e) {
      const msg = (e as Error).message || "Erro ao publicar.";
      console.error("agendado", id, msg);
      // volta pra rascunho com o motivo, pra o corretor ver no painel e publicar na mão
      await db.from("carrosseis").update({ status: "rascunho", erro_publicacao: "Agendamento: " + msg, publicando_em: null }).eq("id", id);
      resultado[id] = "erro";
    }
  }
  return json({ processados: Object.keys(resultado).length, resultado });
});
