// Webhook da Meta (comentários). Deploy com --no-verify-jwt.
// GET  = verificação do endpoint (hub.challenge) usando META_WEBHOOK_VERIFY_TOKEN (você inventa esse texto).
// POST = eventos; valida X-Hub-Signature-256 com META_APP_SECRET e grava em instagram_webhooks.
// Resposta automática ("QUERO") fica pra próxima etapa — aqui só registramos com segurança.
import { admin } from "../_shared/util.ts";

const SECRET = Deno.env.get("META_APP_SECRET")!;
const VERIFY = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN")!;

async function assinaturaValida(body: string, header: string | null) {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const recebido = header.slice(7);
  if (hex.length !== recebido.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ recebido.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === VERIFY)
      return new Response(url.searchParams.get("hub.challenge") ?? "");
    return new Response("forbidden", { status: 403 });
  }
  const body = await req.text();
  if (!(await assinaturaValida(body, req.headers.get("x-hub-signature-256"))))
    return new Response("assinatura inválida", { status: 401 });
  const payload = JSON.parse(body);
  await admin().from("instagram_webhooks").insert({ objeto: payload.object, payload });
  return new Response("ok");
});
