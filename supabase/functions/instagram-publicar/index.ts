// POST (logado) { carrossel_id, legenda?, formato?: "feed"|"stories"|"reels", urls?: string[], video_url?: string }
//   → { media_id, permalink, data_publicada }
// feed    = carrossel (2 a 10 JPEG 4:5) — usa `urls` ou o render_url de cada slide
// stories = um story por imagem (JPEG 9:16)
// reels   = vídeo MP4 9:16 gerado no navegador a partir dos slides
// Arquivos só são aceitos se estiverem na pasta do próprio corretor no Storage.
import { admin, handle, HttpError, json, requireUser } from "../_shared/util.ts";

const GRAPH = "https://graph.instagram.com/v21.0";

async function ig(path: string, params: Record<string, string>, method = "POST") {
  const body = new URLSearchParams(params);
  const res = method === "POST"
    ? await fetch(`${GRAPH}/${path}`, { method, body })
    : await fetch(`${GRAPH}/${path}?${body}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new HttpError(502, "Instagram: " + (data.error?.message ?? res.statusText));
  return data;
}

async function aguardarPronto(id: string, token: string, tentativas = 20, espera = 1500) {
  for (let i = 0; i < tentativas; i++) {
    const s = await ig(id, { fields: "status_code", access_token: token }, "GET");
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new HttpError(502, "Instagram rejeitou uma imagem.");
    await new Promise((r) => setTimeout(r, espera));
  }
  throw new HttpError(504, "O Instagram ainda está processando — tente publicar de novo em alguns minutos.");
}

Deno.serve(handle(async (req) => {
  const uid = await requireUser(req);
  const { carrossel_id, legenda, formato = "feed", urls, video_url } = await req.json();
  if (!["feed", "stories", "reels"].includes(formato)) throw new HttpError(400, "Formato inválido.");
  const pastaDoCorretor = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/slides-render/${uid}/`;
  const daPasta = (u: unknown) => typeof u === "string" && u.startsWith(pastaDoCorretor);
  const db = admin();

  const { data: car } = await db.from("carrosseis").select("*, slides(*)").eq("id", carrossel_id).eq("corretor_id", uid).single();
  if (!car) throw new HttpError(404, "Carrossel não encontrado.");
  const { data: conta } = await db.from("instagram_contas").select("*").eq("corretor_id", uid).eq("status", "ativo").maybeSingle();
  const { data: tok } = await db.from("instagram_tokens").select("*").eq("corretor_id", uid).maybeSingle();
  if (!conta || !tok) throw new HttpError(400, "Conecte o Instagram antes de publicar.");

  // renova o token se faltar menos de 7 dias
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

  const slides = (car.slides ?? []).sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem);
  let imagens: string[];
  if (Array.isArray(urls) && urls.length) {
    if (!urls.every(daPasta)) throw new HttpError(400, "Imagens fora da sua pasta não são aceitas.");
    imagens = urls;
  } else {
    imagens = slides.map((s: { render_url?: string }) => s.render_url).filter(Boolean);
    if (imagens.length !== slides.length) throw new HttpError(400, "Os slides ainda não foram renderizados como imagem.");
  }
  const igId = conta.instagram_business_id as string;
  const caption = (legenda ?? car.legenda ?? "").slice(0, 2200);
  const agora = () => new Date().toISOString();
  const concluir = async (mediaId: string, permalink: string | null) => {
    const quando = agora();
    await db.from("carrosseis").update({
      status: "publicado", data_publicada: quando, instagram_media_id: mediaId, instagram_permalink: permalink, erro_publicacao: null,
    }).eq("id", carrossel_id);
    return json({ media_id: mediaId, permalink, data_publicada: quando, formato });
  };

  try {
    if (formato === "stories") {
      if (imagens.length > 10) throw new HttpError(400, "No máximo 10 stories por vez.");
      let primeiro = "";
      for (const image_url of imagens) {               // um story por slide, na ordem
        const c = await ig(`${igId}/media`, { image_url, media_type: "STORIES", access_token: token });
        await aguardarPronto(c.id, token);
        const pub = await ig(`${igId}/media_publish`, { creation_id: c.id, access_token: token });
        primeiro ||= pub.id;
      }
      return await concluir(primeiro, null);
    }

    if (formato === "reels") {
      if (!daPasta(video_url)) throw new HttpError(400, "Vídeo do Reels inválido.");
      const c = await ig(`${igId}/media`, { media_type: "REELS", video_url, caption, share_to_feed: "true", access_token: token });
      await aguardarPronto(c.id, token, 40, 3000);    // vídeo demora mais pra processar
      const pub = await ig(`${igId}/media_publish`, { creation_id: c.id, access_token: token });
      const info = await ig(pub.id, { fields: "permalink", access_token: token }, "GET");
      return await concluir(pub.id, info.permalink ?? null);
    }

    if (imagens.length < 2 || imagens.length > 10) throw new HttpError(400, "O carrossel do feed aceita de 2 a 10 slides.");
    // 1) um container por imagem
    const filhos: string[] = [];
    for (const image_url of imagens) {
      const c = await ig(`${igId}/media`, { image_url, is_carousel_item: "true", access_token: token });
      filhos.push(c.id);
    }
    for (const id of filhos) await aguardarPronto(id, token);

    // 2) container do carrossel
    const pai = await ig(`${igId}/media`, { media_type: "CAROUSEL", children: filhos.join(","), caption, access_token: token });
    await aguardarPronto(pai.id, token);

    // 3) publica
    const pub = await ig(`${igId}/media_publish`, { creation_id: pai.id, access_token: token });
    const info = await ig(pub.id, { fields: "permalink", access_token: token }, "GET");
    return await concluir(pub.id, info.permalink);
  } catch (e) {
    await db.from("carrosseis").update({ erro_publicacao: (e as Error).message }).eq("id", carrossel_id);
    throw e;
  }
}));
