(function () {
  "use strict";

  /* ============================================================
     CONFIG
  ============================================================ */
  var SUPABASE_URL = "https://qbfmozumntequvecttfs.supabase.co";
  var SUPABASE_KEY = "sb_publishable_xXZFK2Pzq7MHsMv2f_iISw_yriYjMvv";
  var FN_URL = SUPABASE_URL + "/functions/v1/gerar-conteudo";

  /* ============================================================
     HELPERS
  ============================================================ */
  function fmtBRL(v) { v = Number(v) || 0; return "R$ " + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
  function fmtDate(d) { if (!d) return "—"; d = new Date(d); return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  function fmtDateTime(d) { if (!d) return "—"; d = new Date(d); return fmtDate(d) + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return d; }
  // escapa também aspas simples/duplas: o valor às vezes é inserido dentro de atributos HTML
  // (src="...", value="...", data-*="..."), não só entre tags — sem isso um valor com aspas
  // quebraria o atributo e permitiria injetar HTML/JS (XSS). Ver revisão de segurança de 09/09/2026.
  function escapeHtml(s) { return (s == null ? "" : String(s)).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  // só aceita links http(s) — bloqueia "javascript:", "data:" etc. em href/src vindos do banco ou de APIs
  function safeUrl(u) { try { var x = new URL(String(u || ""), location.href); return (x.protocol === "https:" || x.protocol === "http:") ? x.href : ""; } catch (e) { return ""; } }
  // redireciona só pra hosts conhecidos (Stripe Checkout, Instagram OAuth)
  function irPara(u, hostsOk) { var x = safeUrl(u); var h = x ? new URL(x).hostname : ""; if (!x || hostsOk.indexOf(h) < 0 || x.indexOf("https:") !== 0) throw new Error("Endereço de redirecionamento inválido."); window.location.href = x; }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var ICONS = {
    bed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7"/><path d="M3 18v2M21 18v2M3 13h18"/><path d="M7 13V9a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v4"/></svg>',
    car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l1.6-4.8A2 2 0 0 1 6.5 7h11a2 2 0 0 1 1.9 1.2L21 13"/><rect x="2.5" y="13" width="19" height="5.5" rx="1.5"/><circle cx="7" cy="18.5" r="1.4"/><circle cx="17" cy="18.5" r="1.4"/></svg>',
    ruler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 8v3M11 8v3M15 8v3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    wand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l10-10"/><path d="M14 10l6-6"/><path d="M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/><path d="M6 15l.7 1.5L8 17l-1.3.7L6 19l-.7-1.3L4 17l1.3-.5z"/></svg>',
    ig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="0.7" fill="currentColor" stroke="none"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5 11-11"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5Z"/><path d="M3 13l9 5 9-5"/></svg>'
  };

  function propCoverSvg(tipo) {
    var grads = { apartamento: ["#4F7BFF", "#8B5CFF"], terreno: ["#0B1B3A", "#8B5CFF"], casa: ["#8B5CFF", "#00E0FF"] };
    var g = grads[tipo] || grads.apartamento;
    var shape = tipo === "terreno"
      ? '<path d="M20 78 L44 30 L60 52 L74 26 L100 78 Z" fill="rgba(255,255,255,0.9)"/><circle cx="86" cy="24" r="7" fill="rgba(255,255,255,0.9)"/>'
      : '<path d="M20 80 V44 L60 20 L100 44 V80 Z" fill="rgba(255,255,255,0.92)"/><rect x="52" y="58" width="16" height="22" fill="' + g[0] + '"/><rect x="30" y="52" width="12" height="12" fill="' + g[0] + '"/><rect x="78" y="52" width="12" height="12" fill="' + g[0] + '"/>';
    return '<svg viewBox="0 0 120 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')">' + shape + '</svg>';
  }
  function topicCoverSvg(categoria) {
    var g = { Dicas: ["#8B5CFF", "#00E0FF"], Financiamento: ["#0B1B3A", "#8B5CFF"], Vendas: ["#4F7BFF", "#00E0FF"], Mercado: ["#080A10", "#8B5CFF"] }[categoria] || ["#8B5CFF", "#00E0FF"];
    var shape;
    if (categoria === "Financiamento") shape = '<circle cx="40" cy="66" r="16" fill="rgba(255,255,255,0.92)"/><circle cx="62" cy="52" r="16" fill="rgba(255,255,255,0.75)"/><circle cx="86" cy="66" r="16" fill="rgba(255,255,255,0.92)"/>';
    else if (categoria === "Vendas") shape = '<path d="M18 74 L40 54 L56 66 L96 24" stroke="rgba(255,255,255,0.95)" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M78 24 H96 V42" stroke="rgba(255,255,255,0.95)" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    else if (categoria === "Mercado") shape = '<rect x="18" y="46" width="14" height="34" fill="rgba(255,255,255,0.85)"/><rect x="38" y="30" width="14" height="50" fill="rgba(255,255,255,0.95)"/><rect x="58" y="52" width="14" height="28" fill="rgba(255,255,255,0.8)"/><rect x="78" y="20" width="14" height="60" fill="rgba(255,255,255,0.92)"/>';
    else shape = '<circle cx="60" cy="48" r="20" fill="rgba(255,255,255,0.92)"/><path d="M60 76v8M40 88h40" stroke="rgba(255,255,255,0.92)" stroke-width="6" stroke-linecap="round"/><path d="M52 48l6 6 10-12" stroke="' + g[0] + '" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    return '<svg viewBox="0 0 120 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')">' + shape + '</svg>';
  }
  function customCoverSvg() {
    return '<svg viewBox="0 0 120 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="background:linear-gradient(135deg,#0B1B3A,#00E0FF)">' +
      '<circle cx="60" cy="50" r="6" fill="rgba(255,255,255,0.95)"/>' +
      '<path d="M60 50L30 20M60 50L90 20M60 50L24 60M60 50L96 60M60 50L34 84M60 50L86 84" stroke="rgba(255,255,255,0.65)" stroke-width="4" stroke-linecap="round"/></svg>';
  }

  // capa gerada por IA de verdade (Pollinations.ai — grátis, sem chave): monta o <img>, com o SVG como fallback caso a imagem falhe.
  function imgWithFallback(url, fallbackSvg) {
    var id = "img" + Math.random().toString(36).slice(2, 9);
    window.__vitrineFallback = window.__vitrineFallback || {};
    window.__vitrineFallback[id] = fallbackSvg;
    // sem onerror inline (permite CSP sem 'unsafe-inline'); o fallback é tratado por um listener global de "error"
    return '<img src="' + escapeHtml(safeUrl(url)) + '" alt="" loading="lazy" data-fb="' + id + '">';
  }
  function pollinationsUrl(prompt, w, h) {
    return "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width=" + (w || 480) + "&height=" + (h || 600) + "&nologo=true";
  }
  // foto REAL de fundo de cada slide (banco de fotos Pexels, alta resolução) — nunca imagem gerada por IA.
  function isFotoReal(url) { return !!url && !/pollinations\.ai/.test(url); }
  function slideImageUrl(slide) { return isFotoReal(slide.imagem_url) ? slide.imagem_url : null; }

  // busca no servidor fotos reais pros slides que ainda não têm; grava no próprio objeto (e no banco, se já salvos)
  async function garantirFotosReais(slides, contexto, salvarNoBanco) {
    var faltando = slides.map(function (s, i) { return { s: s, i: i }; }).filter(function (x) { return !isFotoReal(x.s.imagem_url); });
    if (!faltando.length) return;
    var resp = await callFunction("buscar-imagens", {
      contexto: contexto || "",
      slides: faltando.map(function (x) { return { titulo: x.s.titulo, corpo: x.s.corpo }; })
    });
    for (var k = 0; k < faltando.length; k++) {
      var foto = (resp.imagens || [])[k];
      if (!foto) continue;
      aplicarFoto(faltando[k].s, foto);
      if (salvarNoBanco) await salvarFotoDoSlide(faltando[k].s);
    }
  }
  // imagem_prompt guarda "crédito||link do fotógrafo" (o Unsplash exige crédito com link sempre que a foto aparece)
  function aplicarFoto(slide, foto) {
    slide._vistas = (slide._vistas || []).concat(slide.imagem_url ? [slide.imagem_url] : []);
    slide.imagem_url = foto.url;
    if (foto.termo) slide._termo = foto.termo;   // reaproveitado no "Trocar" (pula a IA)
    slide.imagem_prompt = (foto.credito || "") + "||" + (foto.link || "");
  }
  async function salvarFotoDoSlide(slide) {
    if (!slide.id) return;
    try { await DB.update("slides", "id=eq." + slide.id, { imagem_url: slide.imagem_url, imagem_prompt: slide.imagem_prompt }); } catch (e) { }
  }
  function igLink(u) { var x = safeUrl(u); return /^https:\/\/(www\.)?instagram\.com\//.test(x) ? x : ""; }
  function creditoDe(slide) {
    if (!isFotoReal(slide.imagem_url)) return null;
    var partes = String(slide.imagem_prompt || "").split("||");
    return { texto: partes[0] || "Foto", link: partes[1] || "" };
  }

  // controles de foto por slide: trocar (outra foto do banco), buscar por termo, ou enviar a própria foto
  function fotoControlsHtml(slides) {
    return '<div class="fotos-ctl">' + slides.map(function (s, i) {
      var cr = creditoDe(s);
      var crLink = cr ? safeUrl(cr.link) : "";
      var credHtml = cr ? (crLink ? '<a href="' + escapeHtml(crLink) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(cr.texto) + '</a>' : escapeHtml(cr.texto)) : '<span class="sem">sem foto</span>';
      return '<div class="foto-ctl"><div class="foto-top"><span class="mono">' + (i + 1) + '</span><span class="cred">' + credHtml + '</span></div>' +
        '<div class="foto-btns">' +
        '<button type="button" class="btn btn-ghost btn-xs" data-foto-trocar="' + i + '">Trocar</button>' +
        '<button type="button" class="btn btn-ghost btn-xs" data-foto-buscar="' + i + '">Buscar…</button>' +
        '<label class="btn btn-ghost btn-xs">Minha foto<input type="file" accept="image/jpeg,image/png,image/webp" data-foto-up="' + i + '" hidden></label>' +
        '</div></div>';
    }).join("") + '</div>';
  }
  function wireFotoControls(root, slides, contexto, persistir, redesenhar) {
    async function trocar(i, termo, btn) {
      var s = slides[i], orig = btn.innerHTML;
      btn.disabled = true; btn.innerHTML = '<div class="spin"></div>';
      try {
        var body = { contexto: contexto, slides: [{ titulo: s.titulo, corpo: s.corpo }], excluir: (s._vistas || []).concat(s.imagem_url ? [s.imagem_url] : []) };
        if (termo || s._termo) body.termos = [termo || s._termo];   // sem chamar a IA de novo quando já sabemos o termo
        var resp = await callFunction("buscar-imagens", body);
        var foto = (resp.imagens || [])[0];
        if (!foto) { toast("Não achei outra foto pra esse slide — tente “Buscar…” com outras palavras."); return; }
        aplicarFoto(s, foto);
        if (persistir) await salvarFotoDoSlide(s);
        redesenhar();
      } catch (err) { toast("Erro ao buscar foto: " + err.message); }
      finally { btn.disabled = false; btn.innerHTML = orig; }
    }
    qsa("[data-foto-trocar]", root).forEach(function (b) { b.onclick = function () { trocar(+b.dataset.fotoTrocar, null, b); }; });
    qsa("[data-foto-buscar]", root).forEach(function (b) {
      b.onclick = function () {
        var t = window.prompt("Buscar foto por (ex.: varanda com vista para o mar, casal recebendo as chaves):");
        if (t && t.trim()) trocar(+b.dataset.fotoBuscar, t.trim(), b);
      };
    });
    qsa("[data-foto-up]", root).forEach(function (inp) {
      inp.onchange = async function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        if (f.size > 15 * 1024 * 1024) { toast("Foto muito grande (máx. 15 MB)."); return; }
        if (["image/jpeg", "image/png", "image/webp"].indexOf(f.type) < 0) { toast("Envie a foto em JPG, PNG ou WEBP."); return; }
        try {
          toast("Enviando sua foto…");
          var ext = (f.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
          var url = await uploadArquivo(f, state.profile.id + "/fotos/" + Date.now() + "." + ext, f.type);
          var s = slides[+inp.dataset.fotoUp];
          aplicarFoto(s, { url: url, credito: "Foto do corretor", link: "" });
          if (persistir) await salvarFotoDoSlide(s);
          redesenhar();
        } catch (err) { toast("Erro ao enviar a foto: " + err.message); }
      };
    });
  }

  function contextoDoCarrossel(c) {
    if (c.origem === "imovel") { var p = findProp(c.propriedade_id); return p ? (p.tipo || "imóvel") + " em " + (p.bairro || "") + ", " + (p.cidade || "") : ""; }
    if (c.origem === "topico") { var t = findTopic(c.topico_id); return t ? "mercado imobiliário, " + t.categoria + ": " + t.gancho : ""; }
    return "mercado imobiliário, " + (c.categoria || "") + ": " + (c.assunto_custom || "");
  }

  function aiCoverImg(prompt, fallbackSvg) {
    return imgWithFallback(pollinationsUrl(prompt), fallbackSvg);
  }
  function coverPromptFor(kind, data) {
    var base = "professional real estate instagram photo, ";
    if (kind === "property") {
      return base + (data.tipo || "apartamento") + " interior, " + (data.bairro || "") + " brazil, bright natural light, editorial photography, no text, no watermark";
    }
    if (kind === "topic") {
      return base + "brazilian real estate market concept for '" + (data.categoria || "") + "', modern minimal composition, no text, no watermark";
    }
    return base + "brazilian real estate, modern minimal composition, no text, no watermark";
  }

  /* ============================================================
     AUTH — GoTrue REST, sessão persistida em localStorage
  ============================================================ */
  var Auth = (function () {
    var session = null;
    function load() {
      try { var raw = localStorage.getItem("vitrine-session"); if (raw) session = JSON.parse(raw); } catch (e) { }
      return session;
    }
    function persist() {
      try {
        if (session) localStorage.setItem("vitrine-session", JSON.stringify(session));
        else localStorage.removeItem("vitrine-session");
      } catch (e) { }
    }
    function setSession(s) { session = s; persist(); }
    function get() { return session; }
    function isExpired() {
      if (!session || !session.expires_at) return true;
      return Date.now() / 1000 > (session.expires_at - 30);
    }
    async function authFetch(path, body) {
      var res = await fetch(SUPABASE_URL + "/auth/v1/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
        body: JSON.stringify(body)
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error_description || data.msg || data.error || "Falha na autenticação.");
      return data;
    }
    async function signUp(email, password, nome) {
      var data = await authFetch("signup", { email: email, password: password, data: { nome: nome } });
      if (data.access_token) setSession(data);
      return data;
    }
    async function signIn(email, password) {
      var data = await authFetch("token?grant_type=password", { email: email, password: password });
      setSession(data);
      return data;
    }
    async function refresh() {
      if (!session || !session.refresh_token) throw new Error("Sem sessão.");
      var data = await authFetch("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
      setSession(data);
      return data;
    }
    async function signOut() {
      if (session && session.access_token) {
        try {
          await fetch(SUPABASE_URL + "/auth/v1/logout", {
            method: "POST",
            headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + session.access_token }
          });
        } catch (e) { }
      }
      setSession(null);
    }
    async function ensureValidToken() {
      if (!session) return null;
      if (isExpired()) { try { await refresh(); } catch (e) { setSession(null); } }
      return session ? session.access_token : null;
    }
    return { load: load, get: get, setSession: setSession, signUp: signUp, signIn: signIn, signOut: signOut, refresh: refresh, ensureValidToken: ensureValidToken };
  })();

  /* ============================================================
     DB — PostgREST helper
  ============================================================ */
  var DB = {
    async rest(path, opts) {
      opts = opts || {};
      await Auth.ensureValidToken();
      var s = Auth.get();
      var headers = Object.assign({
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + (s && s.access_token ? s.access_token : SUPABASE_KEY),
        "Content-Type": "application/json"
      }, opts.headers || {});
      var res = await fetch(SUPABASE_URL + "/rest/v1/" + path, { method: opts.method || "GET", headers: headers, body: opts.body });
      if (!res.ok) {
        var errText = await res.text().catch(function () { return res.statusText; });
        // mensagens do banco (ex.: limite do teste grátis) vêm em JSON: mostra só o texto
        try { var ej = JSON.parse(errText); if (ej && ej.code === "P0001" && ej.message) errText = ej.message; } catch (e) { }
        throw new Error(errText || ("Erro " + res.status));
      }
      if (res.status === 204) return null;
      var text = await res.text();
      return text ? JSON.parse(text) : null;
    },
    select(table, query) { return this.rest(table + "?" + (query || "select=*"), { method: "GET" }); },
    insert(table, data, opts) {
      opts = opts || {};
      return this.rest(table, { method: "POST", body: JSON.stringify(data), headers: { Prefer: (opts.minimal ? "return=minimal" : "return=representation") } });
    },
    update(table, query, data) {
      return this.rest(table + "?" + query, { method: "PATCH", body: JSON.stringify(data), headers: { Prefer: "return=representation" } });
    },
    upsert(table, data, onConflict) {
      return this.rest(table + "?on_conflict=" + onConflict, { method: "POST", body: JSON.stringify(data), headers: { Prefer: "resolution=merge-duplicates,return=representation" } });
    },
    del(table, query) { return this.rest(table + "?" + query, { method: "DELETE" }); }
  };

  async function callFunction(name, payload) {
    await Auth.ensureValidToken();
    var s = Auth.get();
    var res = await fetch(SUPABASE_URL + "/functions/v1/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + (s && s.access_token ? s.access_token : SUPABASE_KEY) },
      body: JSON.stringify(payload)
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || "Erro ao chamar o servidor.");
    return data;
  }

  /* ============================================================
     ESTADO EM MEMÓRIA (carregado do Supabase)
  ============================================================ */
  var state = {
    profile: null,
    assinatura: null,
    plano: null,
    planos: [],
    propriedades: [],
    carrosseis: [],
    topicos: [],
    templates: [],
    igConta: null,
    autoReply: null
  };

  function findProp(id) { return state.propriedades.find(function (p) { return p.id === id; }); }
  function findTopic(id) { return state.topicos.find(function (t) { return t.id === id; }); }
  function findTemplateBySlug(slug) { return state.templates.find(function (t) { return t.slug === slug; }); }
  function findTemplateById(id) { return state.templates.find(function (t) { return t.id === id; }); }
  function findPlano(id) { return state.planos.find(function (p) { return p.id === id; }); }

  function getSubjectMeta(c) {
    var meta;
    if (c.origem === "topico") {
      var t = findTopic(c.topico_id);
      meta = { titulo: t ? t.gancho : "Assunto do mercado", sub: t ? t.categoria + " · sugestão da Vitrine" : "Sugestão da Vitrine", art: topicCoverSvg(t ? t.categoria : "Dicas") };
    } else if (c.origem === "custom") {
      meta = { titulo: c.assunto_custom || "Assunto personalizado", sub: (c.categoria || "Mercado") + " · assunto próprio", art: customCoverSvg() };
    } else {
      var p = findProp(c.propriedade_id);
      meta = p ? { titulo: p.titulo, sub: (p.bairro || "") + " · " + (p.cidade || ""), art: propCoverSvg(p.tipo) } : { titulo: "Imóvel removido", sub: "—", art: customCoverSvg() };
    }
    // se o carrossel já foi salvo com uma imagem de capa real (Pollinations.ai), usa ela — com o SVG acima como fallback.
    // imagem_url passa por escapeHtml() porque é um valor gravado no banco (RLS permite o dono escrever nos próprios
    // slides) e vai direto num atributo HTML — sem isso, um valor malicioso ali quebraria o atributo (XSS).
    var capa = c.slides && c.slides[0];
    if (capa && isFotoReal(capa.imagem_url)) meta.art = imgWithFallback(capa.imagem_url, meta.art);
    return meta;
  }

  /* ---------------- toast ---------------- */
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  /* ---------------- promoção de lançamento ---------------- */
  // 30% off no 1º mês do plano mensal para NOVOS assinantes — desconto fixo, sem prazo nem contagem regressiva
  // (escolha do dono: nada de "acaba hoje" falso). O desconto real é aplicado no servidor (stripe-checkout).
  // Pra fazer uma rodada com prazo de verdade no futuro, é só colocar uma data aqui (e a mesma no stripe-checkout).
  var PROMO_FIM = null;
  var SUPORTE_EMAIL = "vitrinecorretor@gmail.com";
  function promoAtiva() { return !PROMO_FIM || Date.now() < PROMO_FIM.getTime(); }
  function iniciarContadoresPromo() {
    if (!PROMO_FIM) {   // desconto fixo: mostra a oferta, sem relógio
      qsa("[data-promo]").forEach(function (el) { el.hidden = false; });
      qsa("[data-countdown]").forEach(function (el) { el.hidden = true; });
      return;
    }
    function tick() {
      var ms = PROMO_FIM.getTime() - Date.now();
      qsa("[data-promo]").forEach(function (el) { el.hidden = ms <= 0; });
      if (ms <= 0) return;
      // contagem em HORAS corridas (sem dias): ex. 585h 12m 30s
      var h = Math.floor(ms / 36e5), m = Math.floor(ms / 6e4) % 60, sg = Math.floor(ms / 1e3) % 60;
      qsa("[data-countdown]").forEach(function (el) {
        el.innerHTML = '<span><b>' + h + '</b>h</span><span><b>' + pad2(m) + '</b>m</span><span><b>' + pad2(sg) + '</b>s</span>';
      });
    }
    tick(); setInterval(tick, 1000);
  }
  qsa("[data-suporte]").forEach(function (a) { a.href = "mailto:" + SUPORTE_EMAIL; if (!a.textContent.trim()) a.textContent = SUPORTE_EMAIL; });
  iniciarContadoresPromo();

  /* ---------------- fontes das postagens ---------------- */
  // cada carrossel guarda a fonte escolhida (coluna carrosseis.fonte); o mesmo par vale pra prévia, JPEG e vídeo
  var FONTES = {
    moderna: { nome: "Moderna", titulo: '"Space Grotesk", sans-serif', tPeso: 700, corpo: '"Manrope", sans-serif' },
    impacto: { nome: "Impacto", titulo: '"Anton", sans-serif', tPeso: 400, corpo: '"Manrope", sans-serif' },
    elegante: { nome: "Elegante", titulo: '"Playfair Display", serif', tPeso: 800, corpo: '"Manrope", sans-serif' },
    amigavel: { nome: "Amigável", titulo: '"Poppins", sans-serif', tPeso: 800, corpo: '"Poppins", sans-serif' },
    futurista: { nome: "Futurista", titulo: '"Unbounded", sans-serif', tPeso: 700, corpo: '"Manrope", sans-serif' },
    classica: { nome: "Clássica", titulo: '"Bricolage Grotesque", sans-serif', tPeso: 800, corpo: '"Plus Jakarta Sans", sans-serif' }
  };
  function fonteDe(id) { return FONTES[id] ? id : "moderna"; }
  function fontPickerHtml(atual) {
    return '<div class="fonts-titulo">Fonte do carrossel</div><div class="font-grid">' + Object.keys(FONTES).map(function (k) {
      var f = FONTES[k];
      return '<button type="button" class="font-opt' + (k === fonteDe(atual) ? " on" : "") + '" data-fonte="' + k + '">' +
        '<span class="aa" style="font-family:' + f.titulo.replace(/"/g, "&quot;") + ';font-weight:' + f.tPeso + '">Aa</span><span class="nm">' + f.nome + '</span></button>';
    }).join("") + '</div>';
  }
  async function carregarFonte(id) {
    var f = FONTES[fonteDe(id)];
    try { await Promise.all([document.fonts.load(f.tPeso + " 80px " + f.titulo), document.fonts.load("500 44px " + f.corpo), document.fonts.load("700 34px " + f.corpo)]); } catch (e) { }
  }

  /* ---------------- slide tile renderer ---------------- */
  function slideTile(slide, tplSlug, mini, index, total, art, fonte) {
    // imagem relacionada sempre por baixo do texto (fundo do slide inteiro), com o SVG/cor do template como fallback
    var foto = mini ? null : slideImageUrl(slide);
    var artHtml = foto ? '<div class="tile-bg">' + imgWithFallback(foto, "") + '</div>' : "";
    return '<div class="slide-tile fnt-' + fonteDe(fonte) + ' ' + (mini ? "mini " : "") + (foto ? "has-bg " : "") + 'tpl-' + (tplSlug || "minimalista") + '">' + artHtml +
      '<div class="stag">' + escapeHtml(slide.tag || "") + '</div>' +
      '<div class="stitle">' + tituloHtml(slide.titulo) + '</div>' +
      '<div class="sbody">' + escapeHtml(slide.corpo) + '</div>' +
      (mini ? "" : '<div class="sindex">' + index + "/" + total + "</div>") +
      "</div>";
  }
  function slideStrip(slides, tplSlug, mini, art, fonte) {
    return (slides || []).map(function (s, i) { return slideTile(s, tplSlug, mini, i + 1, slides.length, i === 0 ? art : null, fonte); }).join("");
  }


  /* ============================================================
     RENDER DOS SLIDES EM JPEG (1080×1350, 4:5) — o Instagram só aceita imagem
  ============================================================ */
  var SLIDE_W = 1080, SLIDE_H = 1350;
  var SLIDE_THEMES = {
    minimalista: { bg: ["#0E1022", "#0E1022"], ink: "#F3F4FF", tag: "#A78BFF", border: "#252A50" },
    vibrante: { bg: ["#8B5CFF", "#00B8E6"], ink: "#FFFFFF", tag: "rgba(255,255,255,0.9)", border: "#8B5CFF" },
    editorial: { bg: ["#080A10", "#0F1B33"], ink: "#EEF0F6", tag: "#00E0FF", border: "#00E0FF" }
  };

  function loadImage(url) {
    return new Promise(function (resolve) {
      if (!url) return resolve(null);
      var img = new Image();
      img.crossOrigin = "anonymous";            // sem isso o canvas fica "contaminado" e não exporta
      var t = setTimeout(function () { resolve(null); }, 20000);
      img.onload = function () { clearTimeout(t); resolve(img); };
      img.onerror = function () { clearTimeout(t); resolve(null); };
      img.src = url;
    });
  }

  /* ---------- destaque de palavras: a IA marca *palavra* no título e ela sai em amarelo ---------- */
  var COR_DESTAQUE = "#FFD60A";
  function semMarcas(t) { return String(t || "").replace(/\*/g, ""); }
  function normPalavra(w) { return String(w || "").toLowerCase().replace(/[^\p{L}\p{N}%$]/gu, ""); }
  function palavrasDestaque(t) {
    var set = {}, m, re = /\*([^*]+)\*/g;
    while ((m = re.exec(String(t || "")))) m[1].split(/\s+/).forEach(function (w) { var n = normPalavra(w); if (n) set[n] = 1; });
    return set;
  }
  function tituloHtml(t) {
    return escapeHtml(String(t || "")).replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>').replace(/\*/g, "");
  }

  function wrapLines(ctx, text, maxW) {
    var out = [];
    String(text || "").split(/\n/).forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean), line = "";
      if (!words.length) { out.push(""); return; }
      words.forEach(function (w) {
        var test = line ? line + " " + w : w;
        if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
      });
      out.push(line);
    });
    return out;
  }

  // escreve o texto reduzindo a fonte até caber na altura disponível
  function fitText(ctx, text, opts) {
    var size = opts.size, lines;
    for (; size >= opts.min; size -= 2) {
      ctx.font = opts.weight + " " + size + "px " + opts.family;
      lines = wrapLines(ctx, text, opts.maxW);
      if (lines.length * size * opts.lh <= opts.maxH) break;
    }
    return { size: size, lines: lines, height: lines.length * size * opts.lh };
  }

  async function renderSlideJpeg(slide, i, total, tplSlug, bgImg, alto, fonte) {
    var SLIDE_W = 1080, SLIDE_H = alto ? 1920 : 1350;   // alto = 9:16 (stories/reels)
    var th = SLIDE_THEMES[tplSlug] || SLIDE_THEMES.minimalista;
    var cv = document.createElement("canvas"); cv.width = SLIDE_W; cv.height = SLIDE_H;
    var ctx = cv.getContext("2d");
    var g = ctx.createLinearGradient(0, 0, SLIDE_W * 0.6, SLIDE_H);
    g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);

    var pad = 96, top = alto ? 250 : pad;          // 9:16: deixa livre a área da barra do Instagram
    var ink = th.ink, tagColor = th.tag;
    if (bgImg) {
      // foto relacionada ocupando o slide inteiro (object-fit:cover) + véu escuro pro texto ficar legível
      var r = Math.max(SLIDE_W / bgImg.width, SLIDE_H / bgImg.height);
      var sw = SLIDE_W / r, sh = SLIDE_H / r;
      ctx.drawImage(bgImg, (bgImg.width - sw) / 2, (bgImg.height - sh) / 2, sw, sh, 0, 0, SLIDE_W, SLIDE_H);
      var veil = ctx.createLinearGradient(0, 0, 0, SLIDE_H);
      veil.addColorStop(0, "rgba(8,10,16,0.62)"); veil.addColorStop(0.45, "rgba(8,10,16,0.40)"); veil.addColorStop(1, "rgba(8,10,16,0.88)");
      ctx.fillStyle = veil; ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
      ink = "#FFFFFF";
      if (tplSlug === "vibrante") tagColor = "#7CF3FF";
    }

    var F = FONTES[fonteDe(fonte)];
    var family = F.corpo, display = F.titulo, tPeso = F.tPeso;
    ctx.textBaseline = "top";
    if (slide.tag) {
      ctx.fillStyle = tagColor; ctx.font = "700 34px " + family;
      ctx.fillText(String(slide.tag).toUpperCase(), pad, top);
      top += 64;
    }
    var bottomLimit = SLIDE_H - (alto ? 340 : pad) - 60;   // reserva espaço do contador (e da UI do stories/reels)
    var avail = bottomLimit - top;
    var title = fitText(ctx, semMarcas(slide.titulo), { size: i === 0 ? 108 : 84, min: 44, weight: tPeso, family: display, maxW: SLIDE_W - pad * 2, maxH: avail * 0.58, lh: 1.08 });
    ctx.font = tPeso + " " + title.size + "px " + display;
    var hl = palavrasDestaque(slide.titulo), espaco = ctx.measureText(" ").width;
    // sombra leve: o título "salta" da foto, como nos carrosséis que viralizam
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = bgImg ? 18 : 0;
    title.lines.forEach(function (l, k) {
      var x = pad, y = top + k * title.size * 1.08;
      l.split(" ").forEach(function (w) {
        ctx.fillStyle = hl[normPalavra(w)] ? COR_DESTAQUE : ink;
        ctx.fillText(w, x, y);
        x += ctx.measureText(w).width + espaco;
      });
    });
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";

    var bodyMaxH = avail - title.height - 48;
    var body = fitText(ctx, slide.corpo, { size: 44, min: 26, weight: 500, family: family, maxW: SLIDE_W - pad * 2, maxH: bodyMaxH, lh: 1.38 });
    ctx.globalAlpha = 0.92; ctx.font = "500 " + body.size + "px " + family;
    var by = bottomLimit - body.height;           // corpo alinhado embaixo, como no preview
    body.lines.forEach(function (l, k) { ctx.fillText(l, pad, by + k * body.size * 1.38); });
    ctx.textAlign = "right";
    if (i === 0 && total > 1) {
      // capa: chamada visual pra arrastar (aumenta o "swipe rate", sinal forte pro algoritmo)
      ctx.globalAlpha = 1; ctx.fillStyle = COR_DESTAQUE; ctx.font = "800 34px " + family;
      ctx.fillText("ARRASTA  →", SLIDE_W - pad, bottomLimit + 26);
    } else {
      ctx.globalAlpha = 0.7; ctx.font = "500 30px \"JetBrains Mono\", monospace";
      ctx.fillText((i + 1) + "/" + total, SLIDE_W - pad, bottomLimit + 30);
    }
    ctx.globalAlpha = 1; ctx.textAlign = "left";

    // teste grátis: faixa com o link da plataforma embaixo de cada página do carrossel
    if (emTeste()) {
      var faixaH = 64, faixaY = SLIDE_H - (alto ? 250 : 0) - faixaH;
      ctx.fillStyle = "rgba(5,6,13,0.78)"; ctx.fillRect(0, faixaY, SLIDE_W, faixaH);
      ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.font = "600 26px Manrope, Arial, sans-serif";
      ctx.fillText("Criado com Vitrine  ·  " + LINK_VITRINE, SLIDE_W / 2, faixaY + 42);
      ctx.textAlign = "left";
    }

    return new Promise(function (resolve, reject) {
      try { cv.toBlob(function (b) { b ? resolve(b) : reject(new Error("Falha ao gerar imagem.")); }, "image/jpeg", 0.9); }
      catch (e) { reject(e); }
    });
  }

  function uploadSlide(blob, path) { return uploadArquivo(blob, path, "image/jpeg"); }
  async function uploadArquivo(blob, path, tipo) {
    await Auth.ensureValidToken();
    var s = Auth.get();
    var res = await fetch(SUPABASE_URL + "/storage/v1/object/slides-render/" + path, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + s.access_token, "Content-Type": tipo || "application/octet-stream" },
      body: blob
    });
    if (!res.ok) throw new Error("Upload da imagem falhou: " + (await res.text().catch(function () { return res.status; })));
    return SUPABASE_URL + "/storage/v1/object/public/slides-render/" + path;
  }

  // gera os JPEGs de todos os slides em memória (ainda não sobe nada)
  async function renderCarouselBlobs(c, onProgress, formato) {
    var alto = formato === "stories" || formato === "reels";
    var tpl = findTemplateById(c.template_id);
    var slug = (tpl && tpl.slug) || "minimalista";
    await carregarFonte(c.fonte);
    try { await garantirFotosReais(c.slides, contextoDoCarrossel(c), true); }
    catch (e) { toast("Não consegui buscar as fotos: " + e.message); }
    var out = [];
    for (var i = 0; i < c.slides.length; i++) {
      var sl = c.slides[i];
      if (onProgress) onProgress(i + 1, c.slides.length);
      var img = slideImageUrl(sl) ? await loadImage(slideImageUrl(sl)) : null;
      var blob = await renderSlideJpeg(sl, i, c.slides.length, slug, img, alto, c.fonte);
      out.push({ blob: blob, url: URL.createObjectURL(blob) });
    }
    return out;
  }

  // sobe os JPEGs já aprovados no Storage e grava render_url em cada slide
  async function uploadCarouselBlobs(c, blobs, onProgress) {
    var stamp = Date.now();
    for (var i = 0; i < blobs.length; i++) {
      if (onProgress) onProgress(i + 1, blobs.length);
      var url = await uploadSlide(blobs[i].blob, state.profile.id + "/" + c.id + "/" + stamp + "-" + (i + 1) + ".jpg");
      await DB.update("slides", "id=eq." + c.slides[i].id, { render_url: url });
      c.slides[i].render_url = url;
    }
  }

  // agendamento: deixa as imagens do feed prontas no Storage (render_url) pro servidor publicar na hora marcada
  async function prepararAgendado(c, onProgress) {
    var blobs = await renderCarouselBlobs(c, onProgress, "feed");
    await uploadCarouselBlobs(c, blobs);
    blobs.forEach(function (b) { setTimeout(function () { URL.revokeObjectURL(b.url); }, 30000); });
  }
  // agendados antigos (de antes da publicação automática) sem imagens: prepara em segundo plano quando o app abre
  async function prepararAgendadosPendentes() {
    var pend = state.carrosseis.filter(function (c) {
      return c.status === "agendado" && c.slides && c.slides.length && c.slides.some(function (s) { return !s.render_url; });
    });
    for (var i = 0; i < pend.length; i++) {
      try { await prepararAgendado(pend[i]); } catch (e) { console.warn("agendado sem imagens:", e); }
    }
  }

  var HASHTAGS = "#mercadoimobiliario #imoveis #corretordeimoveis #fortaleza #dicasimobiliarias";
  function legendaPadrao(c) {
    var sl = c.slides || [];
    var leg = c.legenda;
    if (!leg) {
      // legenda pensada pra viralizar: gancho da capa + CTA do último slide + pedido de salvar/compartilhar + hashtags
      var capa = sl[0] ? semMarcas(sl[0].titulo) : "";
      var cta = sl.length > 1 ? semMarcas(sl[sl.length - 1].corpo || sl[sl.length - 1].titulo) : "";
      leg = [capa ? capa + " 👇" : "", cta, "📌 Salva pra não perder e manda pra quem precisa ver isso.", HASHTAGS].filter(Boolean).join("\n\n");
    }
    return emTeste() ? leg + "\n\n✨ Criado com a Vitrine — " + LINK_VITRINE : leg;
  }

  var FORMATOS = {
    feed: { nome: "Feed", desc: "Carrossel no feed (4:5)", alto: false },
    reels: { nome: "Reels", desc: "Vídeo 9:16 — 3 s por slide", alto: true },
    stories: { nome: "Stories", desc: "Um story por slide (9:16)", alto: true }
  };

  // gera um MP4 9:16 no navegador: cada slide aparece 3 s, com transição suave
  async function gerarVideoReels(blobs, onProgress) {
    var tipos = ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4"];
    var tipo = window.MediaRecorder && tipos.find(function (t) { return MediaRecorder.isTypeSupported(t); });
    if (!tipo) throw new Error("Seu navegador não consegue gerar vídeo MP4. Use o Google Chrome atualizado para publicar Reels.");
    var W = 1080, H = 1920, POR = 3000, FADE = 450;
    var imgs = await Promise.all(blobs.map(function (b) { return createImageBitmap(b.blob); }));
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d"); ctx.drawImage(imgs[0], 0, 0, W, H);
    var rec = new MediaRecorder(cv.captureStream(30), { mimeType: tipo, videoBitsPerSecond: 8000000 });
    var partes = []; rec.ondataavailable = function (e) { if (e.data && e.data.size) partes.push(e.data); };
    var total = imgs.length * POR;
    rec.start(250);
    var t0 = performance.now();
    await new Promise(function (fim) {
      (function quadro() {
        var t = performance.now() - t0;
        if (t >= total) { fim(); return; }
        var i = Math.min(imgs.length - 1, Math.floor(t / POR)), local = t - i * POR;
        ctx.globalAlpha = 1; ctx.drawImage(imgs[i], 0, 0, W, H);
        if (local > POR - FADE && i < imgs.length - 1) { ctx.globalAlpha = (local - (POR - FADE)) / FADE; ctx.drawImage(imgs[i + 1], 0, 0, W, H); ctx.globalAlpha = 1; }
        if (onProgress) onProgress(Math.min(99, Math.round(t / total * 100)));
        requestAnimationFrame(quadro);
      })();
    });
    await new Promise(function (r) { rec.onstop = r; rec.stop(); });
    return new Blob(partes, { type: "video/mp4" });
  }

  // prévia no formato do Instagram com escolha Feed / Reels / Stories.
  // modo "publicar" → resolve {formato, blobs} ou null. modo "ver" → só visualização.
  function abrirPrevia(c, modo, onProgressInicial) {
    return new Promise(function (resolve) {
      var formato = "feed", idx = 0, cache = {}, carregando = false;
      var user = (state.igConta && state.igConta.status === "ativo" && state.igConta.username) || (state.profile.nome || "seu_perfil").toLowerCase().replace(/\s+/g, "");
      var body = document.getElementById("modal-body");
      function liberar() { Object.keys(cache).forEach(function (k) { cache[k].forEach(function (b) { setTimeout(function () { URL.revokeObjectURL(b.url); }, 60000); }); }); }
      function done(v) { liberar(); closeModal(); resolve(v); }
      async function carregar(f) {
        if (cache[f]) return;
        carregando = true; draw();
        try { cache[f] = await renderCarouselBlobs(c, function (n, t) { var el = document.getElementById("pv-load"); if (el) el.textContent = "Gerando imagem " + n + "/" + t + "…"; if (onProgressInicial) onProgressInicial(n, t); }, f); }
        catch (err) { toast("Erro ao gerar a prévia: " + err.message); }
        carregando = false; idx = 0; draw();
      }
      function draw() {
        var blobs = cache[formato] || [], F = FORMATOS[formato];
        var tabs = '<div class="fmt-tabs">' + Object.keys(FORMATOS).map(function (k) {
          return '<button type="button" class="fmt-tab' + (k === formato ? " on" : "") + '" data-fmt="' + k + '"><b>' + FORMATOS[k].nome + '</b><span>' + FORMATOS[k].desc + '</span></button>';
        }).join("") + '</div>';
        var midia = carregando || !blobs.length
          ? '<div class="igpv-media' + (F.alto ? " alto" : "") + '"><div class="igpv-load"><div class="spin"></div><span id="pv-load">Gerando imagens…</span></div></div>'
          : '<div class="igpv-media' + (F.alto ? " alto" : "") + '"><img src="' + blobs[idx].url + '" alt="Slide ' + (idx + 1) + '">' +
            (formato !== "feed" ? '<div class="igpv-bars">' + blobs.map(function (b, k) { return '<i class="' + (k <= idx ? "on" : "") + '"></i>'; }).join("") + '</div>' : '') +
            (idx > 0 ? '<button class="igpv-nav l" id="pv-prev" aria-label="Anterior">‹</button>' : '') +
            (idx < blobs.length - 1 ? '<button class="igpv-nav r" id="pv-next" aria-label="Próximo">›</button>' : '') +
            '<span class="igpv-count">' + (idx + 1) + '/' + blobs.length + '</span>' +
            (formato === "reels" ? '<span class="igpv-tag">Reels · ' + (blobs.length * 3) + ' s</span>' : '') + '</div>';
        var aviso = formato === "feed" && (c.slides.length < 2 || c.slides.length > 10) ? '<p class="fmt-aviso">O carrossel do feed precisa ter de 2 a 10 slides.</p>' : "";
        body.innerHTML =
          '<div class="modal-head"><div><h3 style="font-size:18px;">Como vai ficar no Instagram</h3>' +
          '<p style="margin:4px 0 0;font-size:12.5px;color:var(--ink-muted);">Escolha onde publicar e confira cada slide.</p></div>' +
          '<button class="modal-close" id="pv-close">' + ICONS.close + '</button></div>' + tabs +
          '<div class="igpv' + (F.alto ? " alto" : "") + '"><div class="igpv-head"><div class="igpv-av">' + escapeHtml(user.slice(0, 1).toUpperCase()) + '</div><b>' + escapeHtml(user) + '</b></div>' + midia +
          (formato === "feed" ? '<div class="igpv-dots">' + blobs.map(function (b, k) { return '<span class="' + (k === idx ? "on" : "") + '"></span>'; }).join("") + '</div>' : '') +
          (formato !== "stories" ? '<div class="igpv-cap"><b>' + escapeHtml(user) + '</b> ' + escapeHtml(legendaPadrao(c)) + '</div>' : '') + '</div>' + aviso +
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
          (modo === "publicar"
            ? '<button class="btn btn-ghost btn-sm" id="pv-back">Voltar e ajustar</button><button class="btn btn-primary btn-sm" id="pv-ok"' + (carregando || aviso ? " disabled" : "") + '>' + ICONS.ig + ' Publicar no ' + F.nome + '</button>'
            : '<button class="btn btn-ghost btn-sm" id="pv-back">Fechar</button>' + (formato === "feed" && !carregando && blobs.length && !c._temp ? '<button class="btn btn-primary btn-sm" id="pv-musica">📲 Postar no Instagram</button>' : '')) + '</div>';
        document.getElementById("pv-close").onclick = function () { done(null); };
        document.getElementById("pv-back").onclick = function () { done(null); };
        var ok = document.getElementById("pv-ok"); if (ok) ok.onclick = function () { done({ formato: formato, blobs: cache[formato] }); };
        var mu = document.getElementById("pv-musica"); if (mu) mu.onclick = function () { var b = cache.feed; closeModal(); resolve(null); postarComMusica(c, b); };
        var pr = document.getElementById("pv-prev"); if (pr) pr.onclick = function () { idx--; draw(); };
        var nx = document.getElementById("pv-next"); if (nx) nx.onclick = function () { idx++; draw(); };
        qsa("[data-fmt]", body).forEach(function (b) { b.onclick = function () { if (carregando) return; formato = b.dataset.fmt; idx = 0; draw(); carregar(formato); }; });
      }
      document.getElementById("overlay").hidden = false;
      carregar("feed");
    });
  }

  /* ---------- postar com música: manda as imagens pro app do Instagram ----------
     A API oficial do Instagram não permite escolher música, então a Vitrine entrega as imagens
     prontas pro app (menu Compartilhar do celular) e copia a legenda. A música é escolhida lá. */
  async function postarComMusica(c, blobsProntos) {
    if (!c.slides || !c.slides.length) { toast("Este carrossel não tem slides."); return; }
    if (testeSemPublicacoes()) { avisoFimDoTeste(); return; }
    var body = document.getElementById("modal-body");
    var blobs = blobsProntos && blobsProntos.length ? blobsProntos : null;
    var legenda = legendaPadrao(c);
    function arquivos() { return blobs.map(function (b, i) { return new File([b.blob], "vitrine-" + (i + 1) + ".jpg", { type: "image/jpeg" }); }); }
    function podeCompartilhar() {
      try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: arquivos() })); } catch (e) { return false; }
    }
    function copiarLegenda() { try { if (navigator.clipboard) navigator.clipboard.writeText(legenda).catch(function () {}); } catch (e) { } }
    function baixarTodas() {
      blobs.forEach(function (b, i) {
        setTimeout(function () { var a = document.createElement("a"); a.href = b.url; a.download = "vitrine-" + (i + 1) + ".jpg"; document.body.appendChild(a); a.click(); a.remove(); }, i * 350);
      });
    }
    var idx = 0;
    var user = (state.igConta && state.igConta.status === "ativo" && state.igConta.username) || (state.profile.nome || "seu_perfil").toLowerCase().replace(/\s+/g, "");
    // prévia igual ao post do Instagram: passa os slides (setas ou arrastando o dedo), legenda e lugar da música
    function previaHtml() {
      return '<div class="igpv mu-previa"><div class="igpv-head"><div class="igpv-av">' + escapeHtml(user.slice(0, 1).toUpperCase()) + '</div>' +
        '<div class="mu-quem"><b>' + escapeHtml(user) + '</b><span class="mu-som">🎵 a música que você escolher no Instagram</span></div></div>' +
        '<div class="igpv-media" id="mu-media"><img src="' + blobs[idx].url + '" alt="Slide ' + (idx + 1) + '" draggable="false">' +
        (idx > 0 ? '<button class="igpv-nav l" id="mu-prev" aria-label="Anterior">‹</button>' : '') +
        (idx < blobs.length - 1 ? '<button class="igpv-nav r" id="mu-next" aria-label="Próximo">›</button>' : '') +
        '<span class="igpv-count">' + (idx + 1) + '/' + blobs.length + '</span></div>' +
        '<div class="igpv-dots">' + blobs.map(function (b, k) { return '<span class="' + (k === idx ? "on" : "") + '"></span>'; }).join("") + '</div>' +
        '<div class="igpv-cap"><b>' + escapeHtml(user) + '</b> ' + escapeHtml(legenda) + '</div></div>';
    }
    function ligarPrevia() {
      var pr = document.getElementById("mu-prev"); if (pr) pr.onclick = function () { idx--; draw(false); };
      var nx = document.getElementById("mu-next"); if (nx) nx.onclick = function () { idx++; draw(false); };
      var m = document.getElementById("mu-media"); if (!m) return;
      var x0 = null;
      m.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      m.addEventListener("touchend", function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (dx < -40 && idx < blobs.length - 1) { idx++; draw(false); }
        else if (dx > 40 && idx > 0) { idx--; draw(false); }
      });
    }
    function draw(carregando, msg) {
      var celular = !carregando && podeCompartilhar();
      body.innerHTML =
        '<div class="modal-head"><div><h3 style="font-size:18px;">📲 Postar no Instagram</h3>' +
        '<p style="margin:4px 0 0;font-size:12.5px;color:var(--ink-muted);">Abre o app do Instagram com o carrossel pronto — lá você pode colocar música e publicar.</p></div>' +
        '<button class="modal-close" id="mu-close">' + ICONS.close + '</button></div>' +
        (carregando
          ? '<div class="igpv-load" style="position:static;padding:30px 0;"><div class="spin"></div><span id="mu-load">' + (msg || "Gerando imagens…") + '</span></div>'
          : '<p class="mu-titulo-previa">Veja como vai ficar antes de postar:</p>' + previaHtml() +
            (celular
              ? '<ol class="mu-passos"><li>Toque em <b>Abrir no Instagram</b> e escolha <b>Instagram → Feed</b>.</li><li>No Instagram, toque no ícone de <b>música 🎵</b> e escolha a sua.</li><li>Na legenda, <b>cole</b> o texto (já copiei pra você) e publique.</li></ol>'
              : '<ol class="mu-passos"><li>Baixe as imagens e passe para o celular (ou abra a Vitrine pelo celular, que é mais rápido).</li><li>No app do Instagram, crie um post, selecione as imagens em ordem e toque no ícone de <b>música 🎵</b>.</li><li>Cole a legenda (já copiei pra você) e publique.</li></ol>' +
                '<p class="fmt-aviso" style="margin-top:6px;">No computador o Instagram não deixa escolher música — só no app do celular.</p>')) +
        '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px;">' +
        (carregando ? '' :
          '<button class="btn btn-ghost btn-sm" id="mu-feito">Já postei — marcar como publicado</button>' +
          (celular
            ? '<button class="btn btn-primary btn-sm" id="mu-abrir">' + ICONS.ig + ' Abrir no Instagram</button>'
            : '<button class="btn btn-primary btn-sm" id="mu-baixar">Baixar imagens e copiar legenda</button>')) +
        '</div>';
      document.getElementById("mu-close").onclick = closeModal;
      if (!carregando) ligarPrevia();
      var ab = document.getElementById("mu-abrir");
      if (ab) ab.onclick = async function () {
        copiarLegenda();
        try { await navigator.share({ files: arquivos(), title: "Carrossel Vitrine" }); }
        catch (e) { if (e && e.name !== "AbortError") { toast("Não deu pra abrir o compartilhamento — baixando as imagens."); baixarTodas(); } }
      };
      var bx = document.getElementById("mu-baixar");
      if (bx) bx.onclick = function () { copiarLegenda(); baixarTodas(); toast("Imagens baixadas e legenda copiada."); };
      var ft = document.getElementById("mu-feito");
      if (ft) ft.onclick = async function () {
        ft.disabled = true;
        try {
          var agora = new Date().toISOString();
          await DB.update("carrosseis", "id=eq." + c.id, { status: "publicado", data_publicada: agora });
          c.status = "publicado"; c.data_publicada = agora;
          closeModal(); toast("Marcado como publicado."); if (!document.getElementById("screen-painel").hidden) renderPainel();
        } catch (e) { ft.disabled = false; toast("Erro ao marcar: " + e.message); }
      };
    }
    document.getElementById("overlay").hidden = false;
    if (!blobs) {
      draw(true);
      try {
        blobs = await renderCarouselBlobs(c, function (n, t) { var el = document.getElementById("mu-load"); if (el) el.textContent = "Gerando imagem " + n + "/" + t + "…"; }, "feed");
      } catch (e) { closeModal(); toast("Erro ao gerar as imagens: " + e.message); return; }
    }
    draw(false);
  }

  async function previewCarousel(c) {
    if (!c.slides || !c.slides.length) { toast("Este carrossel não tem slides."); return; }
    await abrirPrevia(c, "ver");
  }


  /* ============================================================
     AUTH UI
  ============================================================ */
  var authMode = "login";
  function renderAuthView(errorMsg, noteMsg) {
    var view = document.getElementById("auth-view");
    view.innerHTML =
      '<div class="auth-shell"><div class="auth-card">' +
      '<button type="button" class="auth-back" id="auth-back">← Conhecer a Vitrine</button>' +
      '<div class="auth-brand"><div class="brand-mark"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><defs><linearGradient id="vtg-auth" x1="6" y1="10" x2="40" y2="44" gradientUnits="userSpaceOnUse"><stop stop-color="#8B5CFF"/><stop offset="1" stop-color="#00E0FF"/></linearGradient></defs><path d="M7 15 L24 42 L41 15" stroke="url(#vtg-auth)" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7.5 H40" stroke="#fff" stroke-width="5.2" stroke-linecap="round"/><path d="M24 7.5 V29" stroke="#fff" stroke-width="5.2" stroke-linecap="round"/><circle cx="24" cy="42" r="3.4" fill="#00E0FF"/></svg></div>' +
      '<div><div class="brand-name">Vitrine</div><div class="brand-sub" style="margin-top:0;">carrosséis para corretores</div></div></div>' +
      '<div class="auth-tabs">' +
      '<button type="button" class="auth-tab' + (authMode === "login" ? " active" : "") + '" data-authmode="login">Entrar</button>' +
      '<button type="button" class="auth-tab' + (authMode === "signup" ? " active" : "") + '" data-authmode="signup">Criar conta</button>' +
      "</div>" +
      (errorMsg ? '<div class="auth-error">' + escapeHtml(errorMsg) + "</div>" : "") +
      (noteMsg ? '<div class="auth-note">' + escapeHtml(noteMsg) + "</div>" : "") +
      '<form id="auth-form">' +
      (authMode === "signup" ? '<label class="auth-field">Nome<input type="text" id="auth-nome" autocomplete="name" required></label>' : "") +
      '<label class="auth-field">E-mail<input type="email" id="auth-email" autocomplete="email" required></label>' +
      '<label class="auth-field">Senha<input type="password" id="auth-pass" autocomplete="' + (authMode === "signup" ? "new-password" : "current-password") + '" minlength="6" required></label>' +
      '<button type="submit" class="btn btn-primary auth-submit" id="auth-submit">' + (authMode === "signup" ? "Criar conta grátis" : "Entrar") + "</button>" +
      "</form>" +
      '<p style="text-align:center;font-size:11.5px;color:var(--ink-faint);margin:14px 0 0;">' + (authMode === "signup" ? "3 carrosséis grátis no teste, sem cartão." : "Ainda não tem conta? Use a aba \"Criar conta\".") + "</p>" +
      "</div></div>";

    var back = qs("#auth-back", view); if (back) back.onclick = showLanding;
    qsa("[data-authmode]", view).forEach(function (b) {
      b.addEventListener("click", function () { authMode = b.dataset.authmode; renderAuthView(); });
    });
    qs("#auth-form", view).addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = document.getElementById("auth-submit");
      var email = qs("#auth-email", view).value.trim();
      var pass = qs("#auth-pass", view).value;
      var nome = authMode === "signup" ? qs("#auth-nome", view).value.trim() : null;
      btn.disabled = true;
      var originalTxt = btn.textContent;
      btn.innerHTML = '<div class="spin"></div> ' + (authMode === "signup" ? "Criando conta…" : "Entrando…");
      try {
        if (authMode === "signup") {
          var data = await Auth.signUp(email, pass, nome || email.split("@")[0]);
          if (!data.access_token) {
            renderAuthView(null, "Conta criada! Verifique seu e-mail (" + email + ") para confirmar o cadastro e depois faça login.");
            authMode = "login";
            return;
          }
        } else {
          await Auth.signIn(email, pass);
        }
        await bootApp();
      } catch (err) {
        renderAuthView(err.message || "Não foi possível continuar. Tente de novo.");
      } finally {
        btn.disabled = false;
        btn.textContent = originalTxt;
      }
    });
  }

  /* ============================================================
     NAVEGAÇÃO
  ============================================================ */
  var TITLES = {
    painel: ["Painel", "Seus carrosséis, do rascunho à publicação."],
    imoveis: ["Meus imóveis", "Os imóveis disponíveis para virar carrossel."],
    novo: ["Criar carrossel", "Escolha um assunto e a IA monta o carrossel pra você em segundos."],
    instagram: ["Instagram", "Conexão e fila de publicação."],
    plano: ["Plano", "Seu teste grátis e sua assinatura da Vitrine."],
    admin: ["Admin", "Contas cadastradas na plataforma (visível só pra você)."],
    equipe: ["Equipe", "Os corretores da sua imobiliária na Vitrine."]
  };
  // quem vê o menu Admin (o servidor também confere — sem isso ele devolve 403)
  var ADMIN_IDS = ["f13c2703-8848-485a-ae60-97e139a2b0a6"];
  function ehAdmin() { return !!(state.profile && ADMIN_IDS.indexOf(state.profile.id) >= 0); }

  function showScreen(name) {
    qsa(".screen").forEach(function (s) { s.hidden = true; });
    document.getElementById("screen-" + name).hidden = false;
    qsa(".navitem").forEach(function (b) { b.classList.toggle("active", b.dataset.screen === name); });
    document.getElementById("topbar-title").textContent = TITLES[name][0];
    document.getElementById("topbar-sub").textContent = TITLES[name][1];
    if (name === "painel") renderPainel();
    if (name === "imoveis") renderImoveis();
    if (name === "instagram") renderInstagram();
    if (name === "plano") renderPlano();
    if (name === "admin") renderAdmin();
    if (name === "equipe") renderEquipe();
    if (name === "novo" && wizard.step === 1) renderWizard();
  }

  /* ---------------- EQUIPE (planos de imobiliária) ---------------- */
  var equipeInfo = null;
  async function carregarEquipe() {
    try { equipeInfo = await callFunction("equipe", { acao: "minha" }); }
    catch (e) { equipeInfo = null; }
    document.getElementById("nav-equipe").hidden = !(equipeInfo && equipeInfo.papel);
    return equipeInfo;
  }
  async function renderEquipe() {
    var box = document.getElementById("equipe-body");
    box.innerHTML = '<div class="eq-card" style="color:var(--ink-muted);">Carregando…</div>';
    await carregarEquipe();
    var d = equipeInfo;
    if (!d || !d.papel) {
      box.innerHTML = '<div class="eq-card"><h3 style="font-size:16px;margin:0 0 6px;">Você ainda não tem equipe</h3><p style="margin:0 0 12px;color:var(--ink-muted);font-size:13px;">Assine um plano para imobiliárias e convide seus corretores.</p><button class="btn btn-primary btn-sm" id="eq-ver-planos">Ver planos para imobiliárias</button></div>';
      document.getElementById("eq-ver-planos").onclick = function () { showScreen("plano"); };
      return;
    }
    if (d.papel === "membro") {
      box.innerHTML = '<div class="eq-card"><h3 style="font-size:17px;margin:0 0 4px;">' + escapeHtml(d.equipe.nome || "Sua imobiliária") + '</h3>' +
        '<p style="margin:0 0 14px;color:var(--ink-muted);font-size:13px;">Você usa a Vitrine pelo plano da imobiliária' + (d.equipe.dono ? " de " + escapeHtml(d.equipe.dono) : "") + '.' + (d.equipe.ativa ? "" : " A assinatura da imobiliária está pausada no momento.") + '</p>' +
        '<button class="btn btn-ghost btn-sm btn-danger" id="eq-sair">Sair da equipe</button></div>';
      document.getElementById("eq-sair").onclick = async function () {
        if (!confirm("Sair da equipe? Você volta para o teste grátis.")) return;
        try { await callFunction("equipe", { acao: "sair" }); toast("Você saiu da equipe."); location.reload(); } catch (e) { toast(e.message); }
      };
      return;
    }
    var membros = d.membros || [];
    var usadas = 1 + membros.length;
    box.innerHTML =
      '<div class="eq-card"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">' +
      '<div><div style="font-size:12px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.04em;">' + escapeHtml(d.equipe.plano || "Plano de imobiliária") + (d.equipe.ativa ? "" : " · pausado") + '</div>' +
      '<h3 style="font-size:18px;margin:4px 0 0;"><span id="eq-nome">' + escapeHtml(d.equipe.nome || "Minha imobiliária") + '</span> <button class="btn btn-ghost btn-xs" id="eq-renomear">Renomear</button></h3></div>' +
      '<div style="text-align:right;"><div class="eq-vagas">' + usadas + '/' + d.equipe.max + '</div><div style="font-size:12px;color:var(--ink-muted);">vagas usadas (com você)</div></div></div>' +
      (d.equipe.ativa ? '<div class="eq-convite"><input type="email" id="eq-email" placeholder="E-mail do corretor (o mesmo que ele vai usar pra entrar)"><button class="btn btn-primary btn-sm" id="eq-convidar">Convidar</button></div><div id="eq-link-box"></div>'
        : '<p style="margin:12px 0 0;color:#ff9aab;font-size:13px;">A assinatura da imobiliária não está ativa. Assine de novo em Plano para os corretores voltarem a ter acesso.</p>') + '</div>' +
      '<div class="admin-tabela-wrap"><table class="admin-tabela" style="min-width:640px;"><thead><tr><th>Corretor</th><th>Situação</th><th>Carrosséis</th><th></th></tr></thead><tbody>' +
      (membros.length ? membros.map(function (m) {
        return '<tr><td><b>' + escapeHtml(m.nome || m.email) + '</b>' + (m.nome ? '<div class="sub">' + escapeHtml(m.email) + '</div>' : "") + '</td>' +
          '<td>' + (m.status === "ativo" ? '<span class="adm-pill ativa">Ativo</span>' : '<span class="adm-pill trial">Convite enviado</span>' + (m.link ? '<div style="margin-top:6px;"><button class="btn btn-ghost btn-xs" data-copiar="' + escapeHtml(m.link) + '">Copiar link</button></div>' : "")) + '</td>' +
          '<td>' + (m.status === "ativo" ? m.carrosseis : "—") + '</td>' +
          '<td style="text-align:right;"><button class="btn btn-ghost btn-xs btn-danger" data-remover="' + escapeHtml(m.id) + '">' + (m.status === "ativo" ? "Remover" : "Cancelar convite") + '</button></td></tr>';
      }).join("") : '<tr><td colspan="4" style="padding:20px;color:var(--ink-muted);">Nenhum corretor convidado ainda. Digite o e-mail acima e mande o link pra ele.</td></tr>') +
      '</tbody></table></div>';
    var conv = document.getElementById("eq-convidar");
    if (conv) conv.onclick = async function () {
      var email = document.getElementById("eq-email").value.trim();
      if (!email) { toast("Digite o e-mail do corretor."); return; }
      conv.disabled = true;
      try {
        var r = await callFunction("equipe", { acao: "convidar", email: email });
        await renderEquipe();
        if (r.link) mostrarLinkConvite(r.link, email);
        else toast("Esse corretor já está na equipe.");
      } catch (e) { toast(e.message); conv.disabled = false; }
    };
    document.getElementById("eq-renomear").onclick = async function () {
      var nome = prompt("Nome da imobiliária:", d.equipe.nome || "");
      if (nome == null) return;
      try { await callFunction("equipe", { acao: "renomear", nome: nome }); renderEquipe(); } catch (e) { toast(e.message); }
    };
    qsa("[data-copiar]", box).forEach(function (b) { b.onclick = function () { copiarTexto(b.dataset.copiar); }; });
    qsa("[data-remover]", box).forEach(function (b) {
      b.onclick = async function () {
        if (!confirm("Tirar esse corretor da equipe? Ele volta para o teste grátis.")) return;
        try { await callFunction("equipe", { acao: "remover", membro_id: b.dataset.remover }); toast("Feito."); renderEquipe(); } catch (e) { toast(e.message); }
      };
    });
  }
  function copiarTexto(t) {
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast("Link copiado."); }, function () { prompt("Copie o link:", t); });
  }
  function mostrarLinkConvite(link, email) {
    var box = document.getElementById("eq-link-box"); if (!box) return;
    var msg = "Oi! Te convidei pra usar a Vitrine pela nossa imobiliária. Crie sua conta (ou entre) com o e-mail " + email + " por este link: " + link;
    box.innerHTML = '<div class="eq-link"><span style="flex:1;">Convite criado para <b>' + escapeHtml(email) + '</b>. Mande este link pra ele:<br><span class="mono">' + escapeHtml(link) + '</span></span>' +
      '<button class="btn btn-ghost btn-xs" id="eq-copiar-novo">Copiar</button><a class="btn btn-primary btn-xs" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">WhatsApp</a></div>';
    document.getElementById("eq-copiar-novo").onclick = function () { copiarTexto(link); };
  }
  // convite: ?convite=TOKEN — guarda o token até a pessoa entrar/criar conta e então aceita
  var CONVITE_KEY = "vitrine-convite";
  function guardarConviteDaUrl() {
    var p = new URLSearchParams(location.search), t = p.get("convite");
    if (t && /^[a-f0-9]{64}$/.test(t)) { try { sessionStorage.setItem(CONVITE_KEY, t); } catch (e) { } history.replaceState(null, "", location.pathname); return true; }
    return false;
  }
  function conviteGuardado() { try { return sessionStorage.getItem(CONVITE_KEY); } catch (e) { return null; } }
  async function aceitarConvitePendente() {
    var t = conviteGuardado(); if (!t) return;
    try { sessionStorage.removeItem(CONVITE_KEY); } catch (e) { }
    try {
      var r = await callFunction("equipe", { acao: "aceitar", token: t });
      if (!r.ja) { toast("Pronto! Você entrou na equipe" + (r.equipe ? " " + r.equipe : "") + "."); setTimeout(function () { location.reload(); }, 1500); }
    } catch (e) { toast(e.message); }
  }

  /* ---------------- ADMIN ---------------- */
  var adminDados = null;
  async function renderAdmin(forcar) {
    var tab = document.getElementById("admin-tabela");
    if (!adminDados || forcar) {
      tab.innerHTML = '<tr><td style="padding:24px;color:var(--ink-muted);">Carregando contas…</td></tr>';
      try { adminDados = await callFunction("admin-painel", {}); }
      catch (e) { tab.innerHTML = '<tr><td style="padding:24px;color:#ff9aab;">' + escapeHtml(e.message) + '</td></tr>'; return; }
    }
    var r = adminDados.resumo;
    document.getElementById("admin-resumo").innerHTML = [
      ["Contas", r.contas, r.novas_7_dias + " novas nos últimos 7 dias"],
      ["Assinantes ativos", r.assinantes_ativos, "pagando"],
      ["Em teste grátis", r.em_teste, "podem virar assinantes"],
      ["Receita mensal", "R$ " + Number(r.receita_mensal_estimada).toFixed(2).replace(".", ","), r.carrosseis + " carrosséis criados"]
    ].map(function (s) { return '<div class="stat" style="cursor:default;"><div class="n">' + escapeHtml(s[1]) + '</div><div class="l">' + escapeHtml(s[0]) + '</div><div class="sub" style="font-size:11.5px;color:var(--ink-faint);margin-top:4px;">' + escapeHtml(s[2]) + '</div></div>'; }).join("");
    desenharTabelaAdmin();
    var busca = document.getElementById("admin-busca");
    busca.oninput = desenharTabelaAdmin;
    document.getElementById("admin-atualizar").onclick = function () { renderAdmin(true); };
    document.getElementById("admin-csv").onclick = baixarCsvAdmin;
  }
  function contasFiltradas() {
    var q = (document.getElementById("admin-busca").value || "").toLowerCase().trim();
    return (adminDados ? adminDados.contas : []).filter(function (c) {
      return !q || [c.nome, c.email, c.cidade, c.telefone, c.instagram].join(" ").toLowerCase().indexOf(q) >= 0;
    });
  }
  function desenharTabelaAdmin() {
    var linhas = contasFiltradas();
    var pill = function (c) {
      var cls = c.status === "ativa" ? "ativa" : c.status === "trial" ? "trial" : "outro";
      var txt = c.status === "ativa" ? (c.plano || "Assinante") + (c.periodo ? " · " + c.periodo : "") : c.status === "trial" ? "Teste grátis" : c.status;
      return '<span class="adm-pill ' + cls + '">' + escapeHtml(txt) + '</span>';
    };
    document.getElementById("admin-tabela").innerHTML =
      '<thead><tr><th>Corretor</th><th>Contato</th><th>Plano</th><th>Uso</th><th>Instagram</th><th>Cadastro</th><th>Último acesso</th></tr></thead><tbody>' +
      (linhas.length ? linhas.map(function (c) {
        return '<tr><td><b>' + escapeHtml(c.nome || "—") + '</b><div class="sub">' + escapeHtml(c.cidade || "") + (c.creci ? " · CRECI " + escapeHtml(c.creci) : "") + '</div></td>' +
          '<td>' + escapeHtml(c.email) + (c.email_confirmado ? "" : ' <span class="sub">(e-mail não confirmado)</span>') + '<div class="sub">' + escapeHtml(c.telefone || "") + '</div></td>' +
          '<td>' + pill(c) + (c.fim && c.status === "ativa" ? '<div class="sub">renova ' + fmtDate(c.fim) + '</div>' : "") + '</td>' +
          '<td>' + c.carrosseis + ' carrossel' + (c.carrosseis === 1 ? "" : "éis") + '<div class="sub">' + c.publicados + ' publicado' + (c.publicados === 1 ? "" : "s") + (c.status === "trial" ? " · teste " + c.trial_usado + "/" + c.trial_limite : "") + '</div></td>' +
          '<td>' + (c.instagram ? escapeHtml(c.instagram) : '<span class="sub">não conectado</span>') + '</td>' +
          '<td>' + fmtDate(c.cadastrado_em) + '</td>' +
          '<td>' + (c.ultimo_login ? fmtDateTime(c.ultimo_login) : '<span class="sub">nunca</span>') + '</td></tr>';
      }).join("") : '<tr><td colspan="7" style="padding:24px;color:var(--ink-muted);">Nenhuma conta encontrada.</td></tr>') + '</tbody>';
  }
  function baixarCsvAdmin() {
    var cols = ["nome", "email", "telefone", "cidade", "creci", "status", "plano", "periodo", "carrosseis", "publicados", "instagram", "cadastrado_em", "ultimo_login"];
    var esc = function (v) { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    var csv = [cols.join(";")].concat(contasFiltradas().map(function (c) { return cols.map(function (k) { return esc(c[k]); }).join(";"); })).join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "vitrine-contas-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  // teste grátis: posts levam a marca da Vitrine e o limite de publicações é o mesmo dos carrosséis grátis
  var LINK_VITRINE = "vitrinecorretores.github.io";
  function emTeste() { return !state.assinatura || state.assinatura.status === "trial"; }
  function publicadosNoInstagram() { return state.carrosseis.filter(function (c) { return c.status === "publicado" && c.instagram_media_id; }).length; }
  function limitePublicacoesTeste() { return (state.profile && state.profile.trial_limite) || 3; }
  function testeSemPublicacoes() { return emTeste() && publicadosNoInstagram() >= limitePublicacoesTeste(); }
  function avisoFimDoTeste() {
    document.getElementById("modal-body").innerHTML =
      '<div class="modal-head"><h3 style="font-size:18px;">Seu teste grátis terminou</h3><button class="modal-close" id="modal-close">' + ICONS.close + '</button></div>' +
      '<p style="color:var(--ink-muted);font-size:14px;line-height:1.6;margin:6px 0 16px;">Você já publicou os ' + limitePublicacoesTeste() + ' carrosséis do teste grátis no Instagram. Pra continuar publicando — e sem a marca da Vitrine nas imagens — assine um plano.</p>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;"><button class="btn btn-ghost btn-sm" id="fim-teste-fechar">Agora não</button><button class="btn btn-primary btn-sm" id="fim-teste-planos">Ver planos</button></div>';
    document.getElementById("overlay").hidden = false;
    document.getElementById("modal-close").onclick = closeModal;
    document.getElementById("fim-teste-fechar").onclick = closeModal;
    document.getElementById("fim-teste-planos").onclick = function () { closeModal(); showScreen("plano"); };
  }

  function trialBlocked() {
    return state.assinatura && state.assinatura.status === "trial" && state.profile && state.profile.trial_usado >= state.profile.trial_limite;
  }
  function tryStartWizard() {
    if (trialBlocked()) {
      showScreen("plano");
      toast("Você usou seus " + state.profile.trial_limite + " carrosséis grátis. Assine pra continuar criando.");
      return false;
    }
    resetWizard();
    return true;
  }

  /* ============================================================
     PAINEL
  ============================================================ */
  var painelFilter = null;

  function renderPainel() {
    var total = state.carrosseis.length;
    var rasc = state.carrosseis.filter(function (c) { return c.status === "rascunho"; }).length;
    var ag = state.carrosseis.filter(function (c) { return c.status === "agendado"; }).length;
    var pub = state.carrosseis.filter(function (c) { return c.status === "publicado"; }).length;
    document.getElementById("stat-row").innerHTML = [
      ["Carrosséis criados", total, "all"], ["Rascunhos", rasc, "rascunho"], ["Agendados", ag, "agendado"], ["Publicados", pub, "publicado"]
    ].map(function (s) {
      var isActive = s[2] === "all" ? !painelFilter : painelFilter === s[2];
      return '<button type="button" class="stat' + (isActive ? " active" : "") + '" data-filter="' + s[2] + '">' +
        '<div class="n mono">' + s[1] + '</div><div class="l">' + s[0] + '</div></button>';
    }).join("");
    qsa("#stat-row [data-filter]").forEach(function (b) {
      b.addEventListener("click", function () {
        var f = b.dataset.filter;
        painelFilter = (f === "all" || painelFilter === f) ? null : f;
        renderPainel();
      });
    });

    var sectionHint = document.getElementById("kanban-hint");
    if (painelFilter) {
      var fLabel = painelFilter === "rascunho" ? "Rascunhos" : painelFilter === "agendado" ? "Agendados" : "Publicados";
      sectionHint.innerHTML = 'mostrando só: <strong>' + fLabel + '</strong> · <a href="#" id="clear-filter" style="color:var(--accent2);text-decoration:underline;">ver todos</a>';
      document.getElementById("clear-filter").addEventListener("click", function (e) { e.preventDefault(); painelFilter = null; renderPainel(); });
    } else {
      sectionHint.textContent = "clique num status acima pra filtrar";
    }

    var allCols = [
      { status: "rascunho", label: "Rascunho" },
      { status: "agendado", label: "Agendado" },
      { status: "publicado", label: "Publicado" }
    ];
    var cols = painelFilter ? allCols.filter(function (c) { return c.status === painelFilter; }) : allCols;
    document.getElementById("kanban").classList.toggle("single", cols.length === 1);
    document.getElementById("kanban").innerHTML = cols.map(function (col) {
      var items = state.carrosseis.filter(function (c) { return c.status === col.status; })
        .sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      var body = items.length ? items.map(function (c) {
        var meta = getSubjectMeta(c);
        var tpl = findTemplateById(c.template_id);
        var slide0 = (c.slides && c.slides[0]) || { tag: "", titulo: meta.titulo, corpo: "" };
        var when = c.status === "agendado" ? "Agendado " + fmtDateTime(c.data_agendada)
          : c.status === "publicado" ? "Publicado " + fmtDate(c.data_publicada)
          : "Criado " + fmtDate(c.created_at);
        return '<div class="ccard">' +
          '<div class="thumb">' + slideTile(slide0, tpl && tpl.slug, true, 1, 1, null, c.fonte) + '</div>' +
          '<div class="body">' +
          '<h4>' + escapeHtml(meta.titulo) + '</h4>' +
          '<div class="addr">' + escapeHtml(meta.sub) + '</div>' +
          '<div class="meta">' + when + '</div>' +
          (c.erro_publicacao ? '<div class="meta erro-pub" title="' + escapeHtml(c.erro_publicacao) + '">⚠ ' + escapeHtml(c.erro_publicacao) + '</div>' : '') +
          '<div class="actions">' +
          '<button class="btn btn-ghost btn-sm" data-view="' + c.id + '">' + ICONS.eye + '</button>' +
          '<button class="btn btn-ghost btn-sm" data-del="' + c.id + '">' + ICONS.trash + '</button>' +
          '</div>' +
          '</div></div>';
      }).join("") : '<div class="empty-col">Nada por aqui ainda.</div>';
      return '<div><div class="kcol-head">' + col.label + ' <span class="n">' + items.length + '</span></div><div class="kcol">' + body + '</div></div>';
    }).join("");

    qsa("[data-view]").forEach(function (b) { b.addEventListener("click", function () { openCarouselModal(b.dataset.view); }); });
    qsa("[data-del]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var id = b.dataset.del;
        try {
          await DB.del("slides", "carrossel_id=eq." + id);
          await DB.del("carrosseis", "id=eq." + id);
          state.carrosseis = state.carrosseis.filter(function (c) { return c.id !== id; });
          renderPainel(); toast("Carrossel excluído.");
        } catch (err) { toast("Erro ao excluir: " + err.message); }
      });
    });
  }

  function openCarouselModal(id) {
    var c = state.carrosseis.find(function (x) { return x.id === id; });
    if (!c) return;
    var meta = getSubjectMeta(c);
    var tpl = findTemplateById(c.template_id);
    var pillCls = c.status === "publicado" ? "pill-publicado" : c.status === "agendado" ? "pill-agendado" : "pill-draft";
    var extra = c.status === "publicado"
      ? (igLink(c.instagram_permalink) ? '<a class="btn btn-ghost btn-sm" href="' + escapeHtml(igLink(c.instagram_permalink)) + '" target="_blank" rel="noopener noreferrer">' + ICONS.ig + ' Ver no Instagram</a>' : "")
      : '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">' +
        '<button class="btn btn-ghost btn-sm" id="preview-ig">' + ICONS.eye + ' Ver como fica</button>' +
        (c.status === "agendado" ? '<button class="btn btn-ghost btn-sm" id="mark-published">' + ICONS.check + ' Marcar como publicado</button>' : "") +
        '<button class="btn btn-primary btn-sm" id="publish-ig">📲 Postar no Instagram</button></div>';
    document.getElementById("modal-body").innerHTML =
      '<div class="modal-head"><div><h3 style="font-size:19px;">' + escapeHtml(meta.titulo) + '</h3>' +
      '<span class="pill ' + pillCls + '" style="margin-top:6px;">' + escapeHtml(c.status) + '</span></div>' +
      '<button class="modal-close" id="modal-close">' + ICONS.close + '</button></div>' +
      '<div class="carousel-strip">' + slideStrip(c.slides, tpl && tpl.slug, false, meta.art, c.fonte) + '</div>' +
      (c.status !== "publicado" ? '<div id="modal-fontes">' + fontPickerHtml(c.fonte) + '</div>' : "") +
      (c.status !== "publicado" ? '<div class="fotos-titulo">Fotos dos slides</div>' + fotoControlsHtml(c.slides) : "") +
      (c.direcionamento ? '<div style="font-size:12px;color:var(--ink-muted);margin-bottom:8px;"><strong>Direcionamento usado:</strong> ' + escapeHtml(c.direcionamento) + '</div>' : "") +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">' +
      '<span style="font-size:12px;color:var(--ink-faint);">' + escapeHtml(meta.sub) + '</span>' + extra + '</div>';
    document.getElementById("overlay").hidden = false;
    document.getElementById("modal-close").addEventListener("click", closeModal);
    qsa("#modal-fontes [data-fonte]").forEach(function (b) {
      b.onclick = async function () {
        c.fonte = b.dataset.fonte;
        try { await DB.update("carrosseis", "id=eq." + c.id, { fonte: c.fonte }); } catch (e) { toast("Erro ao salvar a fonte: " + e.message); }
        openCarouselModal(c.id); renderPainel();
      };
    });
    if (c.status !== "publicado") wireFotoControls(document.getElementById("modal-body"), c.slides, contextoDoCarrossel(c), true, function () { openCarouselModal(c.id); });
    // carrossel antigo sem foto: busca as fotos reais uma vez e redesenha
    if (!c._buscouFotos && c.slides.some(function (s) { return !isFotoReal(s.imagem_url); })) {
      c._buscouFotos = true;
      garantirFotosReais(c.slides, contextoDoCarrossel(c), true)
        .then(function () { if (!document.getElementById("overlay").hidden) openCarouselModal(c.id); renderPainel(); })
        .catch(function (e) { toast("Não consegui buscar as fotos: " + e.message); });
    }
    var pv = document.getElementById("preview-ig");
    if (pv) pv.addEventListener("click", async function () { await previewCarousel(c); openCarouselModal(c.id); });
    var pi = document.getElementById("publish-ig");
    if (pi) pi.addEventListener("click", function () { postarComMusica(c); });
    var mp = document.getElementById("mark-published");
    if (mp) mp.addEventListener("click", async function () {
      try {
        var pubAt = new Date().toISOString();
        await DB.update("carrosseis", "id=eq." + c.id, { status: "publicado", data_publicada: pubAt });
        c.status = "publicado"; c.data_publicada = pubAt;
        closeModal(); renderPainel(); renderInstagram(); toast("Marcado como publicado.");
      } catch (err) { toast("Erro: " + err.message); }
    });
  }
  function closeModal() { document.getElementById("overlay").hidden = true; }

  /* ============================================================
     IMÓVEIS
  ============================================================ */
  function specsLine(p) {
    if (p.tipo === "terreno") return (p.area_m2 || 0) + " m² de área";
    var s = (p.area_m2 || 0) + " m² · " + (p.quartos || 0) + " quarto" + (p.quartos > 1 ? "s" : "") + (p.suites ? " (" + p.suites + " suíte" + (p.suites > 1 ? "s" : "") + ")" : "");
    if (p.vagas) s += " · " + p.vagas + " vaga" + (p.vagas > 1 ? "s" : "");
    return s;
  }

  function fotosDe(p) {
    return (p && Array.isArray(p.fotos) ? p.fotos : []).map(function (f) {
      var u = typeof f === "string" ? f : (f && f.url) || "";
      return /^https:\/\//.test(u) ? safeUrl(u) : "";
    }).filter(Boolean);
  }
  function propCardHtml(p) {
    var fotos = fotosDe(p);
    var specs = p.tipo === "terreno"
      ? '<span>' + ICONS.ruler + (p.area_m2 || 0) + ' m²</span>'
      : '<span>' + ICONS.ruler + (p.area_m2 || 0) + ' m²</span><span>' + ICONS.bed + (p.quartos || 0) + ' qts</span><span>' + ICONS.car + (p.vagas || 0) + ' vg</span>';
    return '<div class="prop-card">' +
      '<div class="prop-cover' + (fotos.length ? " has-foto" : "") + '">' + (fotos.length ? imgWithFallback(fotos[0], propCoverSvg(p.tipo)) : propCoverSvg(p.tipo)) + '<span class="tag">' + escapeHtml(p.tipo) + '</span>' + (fotos.length ? '<span class="prop-nfotos">' + fotos.length + ' foto' + (fotos.length > 1 ? "s" : "") + '</span>' : "") + '</div>' +
      '<div class="prop-body">' +
      '<h3>' + escapeHtml(p.titulo) + '</h3>' +
      '<div class="prop-addr">' + escapeHtml(p.bairro || "") + ' · ' + escapeHtml(p.cidade || "") + '</div>' +
      '<div class="prop-specs">' + specs + '</div>' +
      '<div class="prop-price">' + fmtBRL(p.preco) + (p.finalidade === "aluguel" ? " /mês" : "") + '</div>' +
      '</div>' +
      '<div class="prop-foot"><button class="btn btn-primary" data-create="' + escapeHtml(p.id) + '">' + ICONS.wand + ' Criar carrossel</button>' +
      '<div class="prop-acts"><button class="btn btn-ghost btn-sm" data-prop-fotos="' + escapeHtml(p.id) + '">Fotos</button>' +
      '<button class="btn btn-ghost btn-sm btn-danger" data-prop-del="' + escapeHtml(p.id) + '">Excluir</button></div></div>' +
      '</div>';
  }
  function renderImoveis() {
    document.getElementById("imoveis-count").textContent = state.propriedades.length + " imóveis";
    document.getElementById("prop-grid").innerHTML = state.propriedades.map(propCardHtml).join("") +
      '<button class="add-card" id="add-prop">' + ICONS.plus + ' Novo imóvel</button>';
    qsa("[data-create]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!tryStartWizard()) return;
        wizard.subjectMode = "property";
        wizard.propertyId = b.dataset.create;
        wizard.step = 2;
        showScreen("novo");
        renderWizard();
      });
    });
    qsa("[data-prop-fotos]").forEach(function (b) { b.addEventListener("click", function () { openFotosImovel(b.dataset.propFotos); }); });
    qsa("[data-prop-del]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var p = findProp(b.dataset.propDel); if (!p) return;
        if (!window.confirm('Excluir o imóvel "' + (p.titulo || "") + '"? Os carrosséis já criados continuam salvos.')) return;
        b.disabled = true;
        try {
          // solta os carrosséis desse imóvel antes (eles continuam existindo), depois apaga o imóvel
          await DB.rest("carrosseis?propriedade_id=eq." + encodeURIComponent(p.id), { method: "PATCH", body: JSON.stringify({ propriedade_id: null }), headers: { Prefer: "return=minimal" } });
          await DB.del("propriedades", "id=eq." + encodeURIComponent(p.id));
          state.propriedades = state.propriedades.filter(function (x) { return x.id !== p.id; });
          renderImoveis();
          toast("Imóvel excluído.");
        } catch (e) { b.disabled = false; toast("Não consegui excluir: " + e.message); }
      });
    });
    document.getElementById("add-prop").addEventListener("click", openAddPropertyModal);
  }

  // fotos do imóvel: até 10, JPG/PNG/WEBP, guardadas na pasta do próprio corretor no Storage
  var MAX_FOTOS_IMOVEL = 10;
  async function enviarFotosImovel(p, files) {
    var atuais = fotosDe(p);
    var lista = Array.prototype.slice.call(files || []);
    var livres = Math.max(MAX_FOTOS_IMOVEL - atuais.length, 0);
    if (lista.length > livres) { toast("Máximo de " + MAX_FOTOS_IMOVEL + " fotos por imóvel — enviando só " + livres + "."); lista = lista.slice(0, livres); }
    var novas = [];
    for (var i = 0; i < lista.length; i++) {
      var f = lista[i];
      if (["image/jpeg", "image/png", "image/webp"].indexOf(f.type) < 0) { toast(f.name + ": envie JPG, PNG ou WEBP."); continue; }
      if (f.size > 15 * 1024 * 1024) { toast(f.name + ": foto muito grande (máx. 15 MB)."); continue; }
      var ext = f.type.split("/")[1].replace("jpeg", "jpg");
      novas.push(await uploadArquivo(f, state.profile.id + "/imoveis/" + p.id + "/" + Date.now() + "-" + i + "." + ext, f.type));
    }
    if (!novas.length) return;
    var fotos = atuais.concat(novas);
    await DB.update("propriedades", "id=eq." + encodeURIComponent(p.id), { fotos: fotos });
    p.fotos = fotos;
  }
  async function salvarOrdemFotos(p, fotos) {
    await DB.update("propriedades", "id=eq." + encodeURIComponent(p.id), { fotos: fotos });
    p.fotos = fotos;
  }
  function openFotosImovel(id) {
    var p = findProp(id); if (!p) return;
    function desenhar() {
      var fotos = fotosDe(p);
      var body = document.getElementById("modal-body");
      body.innerHTML =
        '<div class="modal-head"><div><h3 style="font-size:19px;">Fotos do imóvel</h3><p class="imv-sub">' + escapeHtml(p.titulo) + ' · ' + fotos.length + '/' + MAX_FOTOS_IMOVEL + ' — a 1ª é a capa, e elas entram nos carrosséis desse imóvel</p></div><button class="modal-close" id="modal-close">' + ICONS.close + '</button></div>' +
        '<div class="imv-fotos">' + fotos.map(function (u, i) {
          return '<div class="imv-foto">' + imgWithFallback(u, "") +
            (i === 0 ? '<span class="imv-capa">Capa</span>' : '<button type="button" class="imv-capa-btn" data-capa="' + i + '">Usar como capa</button>') +
            '<button type="button" class="imv-rm" data-rm="' + i + '" title="Remover foto">' + ICONS.close + '</button></div>';
        }).join("") +
        (fotos.length < MAX_FOTOS_IMOVEL ? '<label class="imv-add">' + ICONS.plus + '<span>Adicionar fotos</span><input type="file" id="imv-input" accept="image/jpeg,image/png,image/webp" multiple hidden></label>' : "") +
        '</div>';
      document.getElementById("modal-close").addEventListener("click", function () { closeModal(); renderImoveis(); });
      var inp = document.getElementById("imv-input");
      if (inp) inp.addEventListener("change", async function () {
        toast("Enviando fotos…");
        try { await enviarFotosImovel(p, inp.files); toast("Fotos salvas."); } catch (e) { toast("Erro ao enviar: " + e.message); }
        desenhar();
      });
      qsa("[data-rm]", body).forEach(function (b) {
        b.addEventListener("click", async function () {
          var f2 = fotosDe(p); f2.splice(+b.dataset.rm, 1);
          try { await salvarOrdemFotos(p, f2); desenhar(); } catch (e) { toast("Erro: " + e.message); }
        });
      });
      qsa("[data-capa]", body).forEach(function (b) {
        b.addEventListener("click", async function () {
          var f2 = fotosDe(p); var f = f2.splice(+b.dataset.capa, 1)[0]; f2.unshift(f);
          try { await salvarOrdemFotos(p, f2); desenhar(); } catch (e) { toast("Erro: " + e.message); }
        });
      });
    }
    desenhar();
    document.getElementById("overlay").hidden = false;
  }

  function openAddPropertyModal() {
    document.getElementById("modal-body").innerHTML =
      '<div class="modal-head"><h3 style="font-size:19px;">Novo imóvel</h3><button class="modal-close" id="modal-close">' + ICONS.close + '</button></div>' +
      '<div class="form-grid">' +
      '<label class="full">Título<input type="text" id="np-titulo" placeholder="Ex: Cobertura duplex na Praia de Iracema"></label>' +
      '<label>Bairro<input type="text" id="np-bairro" placeholder="Ex: Iracema"></label>' +
      '<label>Cidade<input type="text" id="np-cidade" placeholder="Ex: Fortaleza · CE"></label>' +
      '<label>Tipo<select id="np-tipo"><option value="apartamento">Apartamento</option><option value="casa">Casa</option><option value="terreno">Terreno</option></select></label>' +
      '<label>Finalidade<select id="np-finalidade"><option value="venda">Venda</option><option value="aluguel">Aluguel</option></select></label>' +
      '<label>Preço (R$)<input type="number" id="np-preco" placeholder="450000"></label>' +
      '<label>Área (m²)<input type="number" id="np-m2" placeholder="80"></label>' +
      '<label>Quartos<input type="number" id="np-quartos" value="0"></label>' +
      '<label>Vagas<input type="number" id="np-vagas" value="0"></label>' +
      '<label class="full">Diferenciais (separe por vírgula)<textarea id="np-dif" rows="2" placeholder="Vista para o mar, Reformado, Aceita permuta"></textarea></label>' +
      '<label class="full">Fotos do imóvel (opcional, até 10 — JPG, PNG ou WEBP)<input type="file" id="np-fotos" accept="image/jpeg,image/png,image/webp" multiple></label>' +
      '</div>' +
      '<div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">' +
      '<button class="btn btn-ghost" id="np-cancel">Cancelar</button>' +
      '<button class="btn btn-primary" id="np-save">Adicionar imóvel</button></div>';
    document.getElementById("overlay").hidden = false;
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("np-cancel").addEventListener("click", closeModal);
    document.getElementById("np-save").addEventListener("click", async function () {
      var titulo = document.getElementById("np-titulo").value.trim();
      if (!titulo) { toast("Dê um título ao imóvel."); return; }
      var bairro = document.getElementById("np-bairro").value.trim();
      var cidade = document.getElementById("np-cidade").value.trim() || "Fortaleza · CE";
      var diferenciais = document.getElementById("np-dif").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      if (!diferenciais.length) diferenciais = ["Ótima localização", "Pronto para morar"];
      var payload = {
        corretor_id: state.profile.id,
        tipo: document.getElementById("np-tipo").value,
        finalidade: document.getElementById("np-finalidade").value,
        titulo: titulo,
        bairro: bairro || null,
        cidade: cidade,
        endereco: (bairro || "") + ", " + cidade,
        preco: Number(document.getElementById("np-preco").value) || 0,
        area_m2: Number(document.getElementById("np-m2").value) || 0,
        quartos: Number(document.getElementById("np-quartos").value) || 0,
        suites: 0,
        vagas: Number(document.getElementById("np-vagas").value) || 0,
        diferenciais: diferenciais
      };
      var btn = this; btn.disabled = true;
      try {
        var rows = await DB.insert("propriedades", payload);
        state.propriedades.push(rows[0]);
        var arqs = document.getElementById("np-fotos").files;
        if (arqs && arqs.length) {
          btn.textContent = "Enviando fotos…";
          try { await enviarFotosImovel(rows[0], arqs); } catch (e2) { toast("Imóvel salvo, mas as fotos falharam: " + e2.message); }
        }
        closeModal(); renderImoveis();
        toast("Imóvel adicionado.");
      } catch (err) {
        toast("Erro ao salvar: " + err.message);
      } finally { btn.disabled = false; }
    });
  }

  /* ============================================================
     WIZARD
  ============================================================ */
  function freshWizard() {
    return { step: 1, subjectMode: "topic", propertyId: null, topicId: null, customTopic: "", customCategoria: "Dicas", slides: null, templateSlug: "minimalista", fonte: "impacto", dest: "rascunho", customPrompt: "" };
  }
  var wizard = freshWizard();
  function resetWizard() {
    wizard = freshWizard(); cal = null;
    var tl = document.getElementById("tema-livre-txt"); if (tl) tl.value = "";
    var d = document.getElementById("sched-date"); if (d) d.value = "";
  }

  // svg puro (usado como base/fallback, ex. spotlight do passo 1-2, onde a foto real ainda não importa)
  function wizardArtSvg() {
    if (wizard.subjectMode === "property") { var p = findProp(wizard.propertyId); return p ? propCoverSvg(p.tipo) : null; }
    if (wizard.subjectMode === "topic") { var t = findTopic(wizard.topicId); return t ? topicCoverSvg(t.categoria) : null; }
    return customCoverSvg();
  }
  // foto de capa real (Pollinations.ai) com o SVG como fallback — usada no preview do carrossel (passo 3) e ao salvar.
  function wizardArt() {
    var svg = wizardArtSvg();
    if (!svg) return null;
    return aiCoverImg(wizardCoverPrompt(), svg);
  }
  function wizardCoverPrompt() {
    if (wizard.subjectMode === "property") { var p = findProp(wizard.propertyId); return coverPromptFor("property", p || {}); }
    if (wizard.subjectMode === "topic") { var t = findTopic(wizard.topicId); return coverPromptFor("topic", t || {}); }
    return coverPromptFor("custom", { categoria: wizard.customCategoria });
  }

  function invalidateSlides() { wizard.slides = null; }
  // contexto curto (bairro/tipo do imóvel ou categoria do assunto) pra imagem de cada slide combinar com o tema
  function wizardContexto() {
    if (wizard.subjectMode === "property") { var p = findProp(wizard.propertyId); return p ? (p.tipo || "imóvel") + " em " + (p.bairro || "") : ""; }
    if (wizard.subjectMode === "topic") { var t = findTopic(wizard.topicId); return t ? "mercado imobiliário, " + t.categoria : ""; }
    return "mercado imobiliário, " + (wizard.customCategoria || "");
  }

  var CATEGORIAS = ["Dicas", "Financiamento", "Vendas", "Mercado"];

  function wireStep1Once() {
    qsa("#mode-tabs .mode-tab").forEach(function (b) {
      b.addEventListener("click", function () {
        if (wizard.subjectMode !== b.dataset.mode) invalidateSlides();
        wizard.subjectMode = b.dataset.mode; renderSubjectStep();
      });
    });
    document.getElementById("cat-pick").innerHTML = CATEGORIAS.map(function (cat) {
      return '<button type="button" class="cat-chip" data-cat="' + cat + '">' + cat + '</button>';
    }).join("");
    qsa("#cat-pick .cat-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        if (wizard.customCategoria !== b.dataset.cat) invalidateSlides();
        wizard.customCategoria = b.dataset.cat; renderCustomForm();
      });
    });
    document.getElementById("custom-topic").addEventListener("input", function (e) {
      if (wizard.customTopic !== e.target.value) invalidateSlides();
      wizard.customTopic = e.target.value;
    });
    // tema livre (caixa grande no topo do passo 1): escreve a ideia e já vai pra geração
    function categoriaDoTema(t) {
      t = t.toLowerCase();
      if (/financ|juros|parcela|caixa|fgts|banco|entrada|cr[eé]dito/.test(t)) return "Financiamento";
      if (/vend|negoci|cliente|comprador|visita|proposta|corretor/.test(t)) return "Vendas";
      if (/mercado|valoriz|pre[cç]o|alta|queda|investi|aluguel sobe|tend[eê]ncia|bairro/.test(t)) return "Mercado";
      return "Dicas";
    }
    function criarComTemaLivre() {
      var txt = document.getElementById("tema-livre-txt").value.trim();
      if (txt.length < 5) { toast("Escreva sua ideia em pelo menos algumas palavras."); document.getElementById("tema-livre-txt").focus(); return; }
      invalidateSlides();
      wizard.subjectMode = "custom";
      wizard.customTopic = txt;
      wizard.customCategoria = categoriaDoTema(txt);
      wizard.step = 2;
      renderWizard();
      runGeneration();
    }
    document.getElementById("tema-livre-btn").addEventListener("click", criarComTemaLivre);
    document.getElementById("tema-livre-txt").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); criarComTemaLivre(); }
    });
    document.getElementById("surprise-btn").addEventListener("click", function () {
      invalidateSlides(); wizard.subjectMode = "topic"; renderSubjectStep();
    });
    document.getElementById("wiz-cancel").addEventListener("click", function () { resetWizard(); showScreen("painel"); });
    document.getElementById("wiz-back").addEventListener("click", function () { if (wizard.step > 1) { wizard.step--; renderWizard(); } });
    document.getElementById("wiz-next").addEventListener("click", onWizNext);
  }

  function renderSubjectStep() {
    qsa("#mode-tabs .mode-tab").forEach(function (b) { b.classList.toggle("active", b.dataset.mode === wizard.subjectMode); });
    document.getElementById("subject-topic").hidden = wizard.subjectMode !== "topic";
    document.getElementById("subject-property").hidden = wizard.subjectMode !== "property";
    document.getElementById("subject-custom").hidden = wizard.subjectMode !== "custom";
    if (wizard.subjectMode === "topic") renderTopicGrid();
    if (wizard.subjectMode === "property") renderPickGrid();
    if (wizard.subjectMode === "custom") renderCustomForm();
  }

  // assuntos sugeridos: a cada carregamento da página mostra 6 diferentes — começa com um sorteio do banco
  // e troca pelos que a IA acabou de criar (sugerir-conteudo) assim que chegam
  var topicosDaVez = null, topicosIA = false;
  function sortear(lista, n) {
    var c = lista.slice();
    for (var i = c.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = c[i]; c[i] = c[j]; c[j] = t; }
    return c.slice(0, n);
  }
  var gerandoAssuntos = false;
  function statusAssuntos(txt) { var el = document.getElementById("topic-status"); if (el) el.textContent = txt; }
  // pede 6 assuntos inéditos pra IA (botão "Gerar novas sugestões"; automático só 1x/24h)
  function gerarNovosAssuntos(manual) {
    if (gerandoAssuntos) return;
    gerandoAssuntos = true;
    var btn = document.getElementById("topic-novas");
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin"></div> Gerando…'; }
    statusAssuntos("A IA está criando assuntos novos de mercado imobiliário…");
    callFunction("sugerir-conteudo", { tipo: "assunto" }).then(function (r) {
      var novos = (r && r.topicos) || [];
      if (!novos.length) throw new Error("A IA não trouxe sugestões agora.");
      state.topicos = state.topicos.concat(novos);
      topicosDaVez = novos.slice(0, 6); topicosIA = true;
      statusAssuntos("✨ Assuntos novos criados pela IA agora");
      if (wizard.subjectMode === "topic") renderTopicGrid();
    }).catch(function (e) {
      if (manual) {
        // sem IA no momento (ex.: limite por hora): pelo menos troca por outros do banco
        topicosDaVez = sortear(state.topicos, 6); topicosIA = false;
        if (wizard.subjectMode === "topic") renderTopicGrid();
        toast((e && e.message ? e.message : "Não deu pra gerar agora.") + " Mostrei outros assuntos do banco.");
      }
      statusAssuntos("");
    }).then(function () {
      gerandoAssuntos = false;
      var b = document.getElementById("topic-novas");
      if (b) { b.disabled = false; b.textContent = "✨ Gerar novas sugestões"; }
    });
  }
  function prepararAssuntos() {
    topicosDaVez = sortear(state.topicos, 6); topicosIA = false;
    var btn = document.getElementById("topic-novas");
    if (btn && !btn.dataset.ok) { btn.dataset.ok = "1"; btn.addEventListener("click", function () { gerarNovosAssuntos(true); }); }
    // economia de IA: gera sozinho no máximo 1x a cada 24h por navegador; no resto do tempo mostra os mais recentes do banco
    var ultimo = 0;
    try { ultimo = +localStorage.getItem("vitrine_assuntos_auto") || 0; } catch (e) {}
    if (Date.now() - ultimo > 24 * 3600 * 1000 || state.topicos.length < 6) {
      try { localStorage.setItem("vitrine_assuntos_auto", String(Date.now())); } catch (e) {}
      gerarNovosAssuntos(false);
    } else {
      var recentes = state.topicos.slice().sort(function (a, b) { return String(b.created_at || "").localeCompare(String(a.created_at || "")); });
      topicosDaVez = sortear(recentes.slice(0, 18), 6);
    }
  }

  function renderTopicGrid() {
    if (!topicosDaVez) topicosDaVez = sortear(state.topicos, 6);
    if (wizard.topicId && !topicosDaVez.some(function (t) { return t.id === wizard.topicId; })) { var sel = findTopic(wizard.topicId); if (sel) topicosDaVez = [sel].concat(topicosDaVez.slice(0, 5)); }
    document.getElementById("topic-grid").innerHTML = topicosDaVez.map(function (t) {
      var primeiraIdeia = (t.ideias && t.ideias[0]) ? t.ideias[0].titulo : "";
      return '<div class="topic-card ' + (wizard.topicId === t.id ? "selected" : "") + '" data-topic="' + t.id + '">' +
        '<span class="topic-cat">' + escapeHtml(t.categoria) + '</span><h4>' + escapeHtml(t.gancho) + '</h4><p>' + escapeHtml(primeiraIdeia) + '</p></div>';
    }).join("");
    qsa("[data-topic]").forEach(function (el) {
      el.addEventListener("click", function () {
        if (wizard.topicId !== el.dataset.topic) invalidateSlides();
        wizard.topicId = el.dataset.topic; renderTopicGrid();
      });
    });
  }

  function renderCustomForm() {
    document.getElementById("custom-topic").value = wizard.customTopic;
    qsa("#cat-pick .cat-chip").forEach(function (b) { b.classList.toggle("selected", b.dataset.cat === wizard.customCategoria); });
  }

  function renderSteps() {
    var labels = ["Assunto", "Conteúdo", "Estilo", "Publicar"];
    document.getElementById("steps").innerHTML = labels.map(function (l, i) {
      var n = i + 1, cls = n === wizard.step ? "active" : n < wizard.step ? "done" : "";
      var back = n < wizard.step;
      var dotContent = n < wizard.step ? ICONS.check : n;
      return '<div class="step ' + cls + (back ? " clickable" : "") + '"' + (back ? ' data-goto="' + n + '" title="Voltar pra este passo"' : "") + '>' +
        '<div class="dot">' + dotContent + '</div>' + l + '</div>' + (i < 3 ? '<div class="step-line"></div>' : "");
    }).join("");
    qsa("[data-goto]").forEach(function (el) {
      el.addEventListener("click", function () { wizard.step = Number(el.dataset.goto); renderWizard(); });
    });
  }

  function renderWizard() {
    renderSteps();
    ["1", "2", "3", "4"].forEach(function (n) { document.getElementById("wiz-step-" + n).hidden = (Number(n) !== wizard.step); });
    document.getElementById("wiz-back").style.visibility = wizard.step === 1 ? "hidden" : "visible";
    document.getElementById("wiz-next").textContent = wizard.step === 4 ? "Confirmar" : "Continuar";

    if (wizard.step === 1) renderSubjectStep();
    if (wizard.step === 2) renderGenArea();
    if (wizard.step === 3) renderTplStep();
    if (wizard.step === 4) renderDestStep();
  }

  function renderPickGrid() {
    document.getElementById("pick-grid").innerHTML = state.propriedades.map(function (p) {
      return '<div class="pick-card ' + (wizard.propertyId === p.id ? "selected" : "") + '" data-pick="' + p.id + '">' +
        '<div class="pick-cover">' + propCoverSvg(p.tipo) + '</div>' +
        '<div><h4>' + escapeHtml(p.titulo) + '</h4><div class="addr">' + escapeHtml(p.bairro || "") + '</div></div></div>';
    }).join("") || '<p style="font-size:12.5px;color:var(--ink-faint);">Você ainda não cadastrou imóveis. Adicione um em "Meus imóveis".</p>';
    qsa("[data-pick]").forEach(function (el) {
      el.addEventListener("click", function () {
        if (wizard.propertyId !== el.dataset.pick) invalidateSlides();
        wizard.propertyId = el.dataset.pick; renderPickGrid();
      });
    });
  }

  var PROMPT_SUGGESTIONS = [
    "Foco em quem tá comprando o primeiro imóvel",
    "Tom mais descontraído, como se fosse pra um amigo",
    "Destaque o lado de investimento, não de moradia",
    "Foco em famílias com filhos pequenos",
    "Deixa mais direto, tipo dica rápida de 30 segundos"
  ];

  function subjectSpotlightHtml() {
    if (wizard.subjectMode === "topic") {
      var t = findTopic(wizard.topicId);
      if (!t) return "";
      var ideas = (t.ideias || []).map(function (pt) { return pt.titulo; });
      return '<div class="subject-spotlight"><div class="art">' + topicCoverSvg(t.categoria) + '</div><div>' +
        '<div class="cat">' + escapeHtml(t.categoria) + ' · sugestão da Vitrine</div>' +
        '<h4>' + escapeHtml(t.gancho) + '</h4>' +
        '<div class="spotlight-label">Ideias pra puxar no seu direcionamento:</div>' +
        '<ul class="spotlight-ideas">' + ideas.map(function (i) { return '<li>' + escapeHtml(i) + '</li>'; }).join("") + '</ul>' +
        '</div></div>';
    }
    if (wizard.subjectMode === "property") {
      var p = findProp(wizard.propertyId);
      if (!p) return "";
      return '<div class="subject-spotlight"><div class="art">' + propCoverSvg(p.tipo) + '</div><div>' +
        '<div class="cat">' + escapeHtml(p.bairro || "") + ' · ' + escapeHtml(p.cidade || "") + '</div>' +
        '<h4>' + escapeHtml(p.titulo) + '</h4>' +
        '<div class="spotlight-label">Diferenciais pra puxar no seu direcionamento:</div>' +
        '<ul class="spotlight-ideas">' + (p.diferenciais || []).map(function (d) { return '<li>' + escapeHtml(d) + '</li>'; }).join("") + '</ul>' +
        '</div></div>';
    }
    return '<div class="subject-spotlight"><div class="art">' + customCoverSvg() + '</div><div>' +
      '<div class="cat">' + escapeHtml(wizard.customCategoria || "Mercado") + ' · seu assunto</div>' +
      '<h4>' + escapeHtml(wizard.customTopic || "—") + '</h4>' +
      '<div class="spotlight-label">Dá pra complementar com tom, público-alvo ou um ângulo específico no direcionamento abaixo.</div>' +
      '</div></div>';
  }

  function promptBoxHtml() {
    return '<div style="margin-bottom:16px;">' +
      '<label style="display:block; font-size:12px; font-weight:600; color:var(--ink-muted); margin-bottom:8px;">Direcionamento pra IA (opcional) — o que você, corretor, quer destacar</label>' +
      '<div class="prompt-suggestions" id="prompt-suggestions">' + PROMPT_SUGGESTIONS.map(function (s) {
        return '<button type="button" class="prompt-chip" data-sugg="' + escapeHtml(s) + '">' + escapeHtml(s) + '</button>';
      }).join("") + '</div>' +
      '<textarea id="custom-prompt" rows="2" placeholder="Sem ideia? Clique numa sugestão acima, ou escreva a sua — ex: destaque a vista pro mar" ' +
      'style="width:100%; border:1px solid var(--border); border-radius:8px; background:var(--surface); color:var(--ink); font-family:inherit; font-size:13px; padding:8px 10px; resize:vertical;">' + escapeHtml(wizard.customPrompt) + '</textarea></div>';
  }
  function wirePromptBox() {
    document.getElementById("custom-prompt").addEventListener("input", function (e) { wizard.customPrompt = e.target.value; });
    qsa("#prompt-suggestions .prompt-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        wizard.customPrompt = b.dataset.sugg;
        document.getElementById("custom-prompt").value = wizard.customPrompt;
      });
    });
  }

  function renderGenArea(errMsg) {
    var area = document.getElementById("gen-area");
    if (!wizard.slides) {
      var fonteTxt = wizard.subjectMode === "property"
        ? "os dados do imóvel selecionado — endereço, valor, metragem e diferenciais"
        : wizard.subjectMode === "topic" ? "o assunto sugerido pela Vitrine" : "o assunto que você descreveu";
      area.innerHTML = subjectSpotlightHtml() + promptBoxHtml() +
        '<div class="gen-empty"><div class="wand">' + ICONS.wand + '</div>' +
        (errMsg ? '<p class="err">' + escapeHtml(errMsg) + '</p>' : '') +
        '<p>A IA vai usar ' + fonteTxt + ' — mais o seu direcionamento acima, se tiver — e escrever os slides do carrossel com texto real gerado por IA, mais imagem de capa.</p>' +
        '<button class="btn btn-primary" id="gen-btn">' + ICONS.wand + ' Gerar com IA</button></div>';
      wirePromptBox();
      document.getElementById("gen-btn").addEventListener("click", runGeneration);
      return;
    }
    area.innerHTML = subjectSpotlightHtml() + promptBoxHtml() + '<p class="dica-destaque">Dica: palavras entre *asteriscos* no título saem em <span class="hl">amarelo</span> no carrossel.</p><div class="slide-editor" id="slide-editor"></div>' +
      '<button class="btn btn-ghost btn-sm" id="regen-btn">' + ICONS.wand + ' Gerar novamente com esse direcionamento</button>';
    wirePromptBox();
    var editor = document.getElementById("slide-editor");
    editor.innerHTML = wizard.slides.map(function (s, i) {
      return '<div class="slide-row">' +
        '<div class="tagcol"><span class="slide-num">' + (i + 1) + '/' + wizard.slides.length + '</span><span class="slide-tagname">' + escapeHtml(s.tag) + '</span></div>' +
        '<div><input type="text" data-i="' + i + '" data-f="titulo" value="' + escapeHtml(s.titulo) + '">' +
        '<textarea data-i="' + i + '" data-f="corpo">' + escapeHtml(s.corpo) + '</textarea></div></div>';
    }).join("");
    qsa("input,textarea", editor).forEach(function (el) {
      el.addEventListener("input", function () { wizard.slides[el.dataset.i][el.dataset.f] = el.value; });
    });
    document.getElementById("regen-btn").addEventListener("click", function () { wizard.slides = null; runGeneration(); });
  }

  async function runGeneration() {
    var area = document.getElementById("gen-area");
    var promptEl = document.getElementById("custom-prompt");
    if (promptEl) wizard.customPrompt = promptEl.value;
    area.innerHTML = subjectSpotlightHtml() + promptBoxHtml() +
      '<div class="gen-empty"><div class="wand"><div class="spin" style="border-top-color:var(--accent); border-color:rgba(139,92,255,0.25);"></div></div>' +
      '<p>Gerando texto com IA (Claude)' + (wizard.customPrompt ? " a partir do seu direcionamento" : "") + '…</p></div>';
    try {
      var origem = wizard.subjectMode === "property" ? "imovel" : wizard.subjectMode === "topic" ? "topico" : "custom";
      var dados;
      if (origem === "imovel") { dados = Object.assign({}, findProp(wizard.propertyId)); delete dados.fotos; }
      else if (origem === "topico") dados = findTopic(wizard.topicId);
      else dados = { assunto: wizard.customTopic.trim(), categoria: wizard.customCategoria };

      var resp = await callFunction("gerar-conteudo", { origem: origem, dados: dados, direcionamento: wizard.customPrompt || undefined });
      wizard.slides = resp.slides || [];
      if (!wizard.slides.length) throw new Error("A IA não retornou slides. Tente gerar de novo.");
      area.querySelector(".gen-empty p").textContent = "Texto pronto. Buscando fotos reais em alta resolução pra cada slide…";
      // imóvel com fotos próprias: usa as fotos do corretor nos slides (na ordem), o resto vem do banco de fotos
      if (origem === "imovel") {
        var fotosImovel = fotosDe(findProp(wizard.propertyId));
        wizard.slides.forEach(function (sl, i) { if (fotosImovel[i]) aplicarFoto(sl, { url: fotosImovel[i], credito: "Foto do imóvel", link: "" }); });
      }
      try { await garantirFotosReais(wizard.slides, wizardContexto(), false); }
      catch (e) { toast("Fotos não encontradas agora (" + e.message + ") — dá pra tentar de novo na prévia."); }
      renderGenArea();
    } catch (err) {
      renderGenArea(err.message || "Erro ao gerar conteúdo. Tente de novo.");
    }
  }

  function renderTplStep() {
    document.getElementById("tpl-grid").innerHTML = state.templates.map(function (t) {
      return '<div class="tpl-card ' + (wizard.templateSlug === t.slug ? "selected" : "") + '" data-tpl="' + t.slug + '">' +
        '<div class="tpl-swatch tpl-' + t.slug + '"><span>Aa</span></div>' +
        '<h4>' + escapeHtml(t.nome) + '</h4><p>' + escapeHtml(t.descricao || "") + '</p></div>';
    }).join("");
    qsa("[data-tpl]").forEach(function (el) {
      el.addEventListener("click", function () { wizard.templateSlug = el.dataset.tpl; renderTplStep(); });
    });
    var strip = document.getElementById("preview-strip");
    strip.innerHTML = slideStrip(wizard.slides || [], wizard.templateSlug, false, wizardArt(), wizard.fonte);
    var fbox = document.getElementById("wiz-fontes");
    if (!fbox) { fbox = document.createElement("div"); fbox.id = "wiz-fontes"; strip.insertAdjacentElement("beforebegin", fbox); }
    fbox.innerHTML = fontPickerHtml(wizard.fonte);
    qsa("[data-fonte]", fbox).forEach(function (b) { b.onclick = function () { wizard.fonte = b.dataset.fonte; renderTplStep(); }; });
    var box = document.getElementById("wiz-fotos");
    if (!box) { box = document.createElement("div"); box.id = "wiz-fotos"; strip.insertAdjacentElement("afterend", box); }
    if (wizard.slides && wizard.slides.length) {
      box.innerHTML = '<div class="fotos-titulo">Fotos dos slides — troque as que quiser</div>' + fotoControlsHtml(wizard.slides);
      wireFotoControls(box, wizard.slides, wizardContexto(), false, renderTplStep);
    } else box.innerHTML = "";
  }

  function renderDestStep() {
    var dests = [
      { id: "rascunho", nome: "Salvar rascunho", desc: "Continue editando depois" },
      { id: "agendado", nome: "Agendar", desc: "Escolha data e horário" },
      { id: "musica", nome: "📲 Postar no Instagram", desc: "Abre o app do Instagram com tudo pronto — dá pra pôr música" }
    ];
    document.getElementById("dest-grid").innerHTML = dests.map(function (d) {
      return '<div class="dest-card ' + (wizard.dest === d.id ? "selected" : "") + '" data-dest="' + d.id + '"><h4>' + d.nome + '</h4><p>' + d.desc + '</p></div>';
    }).join("");
    qsa("[data-dest]").forEach(function (el) {
      el.addEventListener("click", function () { wizard.dest = el.dataset.dest; renderDestStep(); });
    });
    var vb = document.getElementById("wiz-ver-previa");
    if (!vb) {
      vb = document.createElement("button"); vb.type = "button"; vb.id = "wiz-ver-previa"; vb.className = "btn btn-ghost wiz-ver-previa";
      vb.innerHTML = "👁 Ver como fica no Instagram";
      document.getElementById("dest-grid").insertAdjacentElement("afterend", vb);
      vb.onclick = function () { verPreviaDoWizard(); };
    }
    document.getElementById("schedule-box").hidden = wizard.dest !== "agendado";
    if (wizard.dest === "agendado") renderCalendario();
    var igOn = state.igConta && state.igConta.status === "ativo";
    document.getElementById("ig-warn").hidden = !(wizard.dest === "agendado" && !igOn);
  }

  /* ---------- calendário de agendamento (dia + hora) ---------- */
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var DIAS_SEM = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var HORARIOS_TOP = ["12:00", "18:00", "19:00", "20:00"];   // picos de engajamento no Instagram
  var cal = null;
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function renderCalendario() {
    var inD = document.getElementById("sched-date"), inT = document.getElementById("sched-time");
    var agora = new Date();
    if (!inD.value) { var d0 = addDays(1); inD.value = ymd(d0); }
    if (!inT.value) inT.value = "18:00";
    var sel = new Date(inD.value + "T00:00:00");
    if (!cal) cal = { ano: sel.getFullYear(), mes: sel.getMonth() };
    var primeiro = new Date(cal.ano, cal.mes, 1), diasNoMes = new Date(cal.ano, cal.mes + 1, 0).getDate();
    var hojeStr = ymd(agora), limite = addDays(90);
    var podeVoltar = cal.ano > agora.getFullYear() || cal.mes > agora.getMonth();
    var podeAvancar = new Date(cal.ano, cal.mes + 1, 1) <= limite;
    var dias = "";
    for (var v = 0; v < primeiro.getDay(); v++) dias += '<button type="button" class="cal-day vazio" disabled></button>';
    for (var dia = 1; dia <= diasNoMes; dia++) {
      var dt = new Date(cal.ano, cal.mes, dia), str = ymd(dt);
      var passado = str < hojeStr || dt > limite;
      dias += '<button type="button" class="cal-day' + (str === hojeStr ? " hoje" : "") + (str === inD.value ? " on" : "") + '" data-dia="' + str + '"' + (passado ? " disabled" : "") + ">" + dia + "</button>";
    }
    var slots = "";
    for (var h = 7; h <= 22; h++) {
      ["00", "30"].forEach(function (m) {
        var t = pad2(h) + ":" + m;
        var passouHoje = inD.value === hojeStr && new Date(inD.value + "T" + t) <= new Date(agora.getTime() + 10 * 60000);
        slots += '<button type="button" class="cal-slot' + (HORARIOS_TOP.indexOf(t) >= 0 ? " top" : "") + (t === inT.value ? " on" : "") + '" data-hora="' + t + '"' + (passouHoje ? " disabled" : "") + ">" + t + "</button>";
      });
    }
    var quando = new Date(inD.value + "T" + inT.value);
    var resumo = DIAS_SEM[quando.getDay()] + ", " + quando.getDate() + " de " + MESES[quando.getMonth()] + " às " + inT.value;
    document.getElementById("sched-cal").innerHTML =
      '<div><div class="cal-head"><button type="button" class="cal-nav" id="cal-prev"' + (podeVoltar ? "" : " disabled") + ' aria-label="Mês anterior">‹</button>' +
      "<b>" + MESES[cal.mes] + " " + cal.ano + '</b><button type="button" class="cal-nav" id="cal-next"' + (podeAvancar ? "" : " disabled") + ' aria-label="Próximo mês">›</button></div>' +
      '<div class="cal-grid">' + DIAS_SEM.map(function (d) { return '<div class="cal-dow">' + d + "</div>"; }).join("") + dias + "</div></div>" +
      '<div class="cal-times"><h4>Horário</h4><div class="cal-slots">' + slots + '</div><div class="cal-legenda"><i></i> horários de mais engajamento</div></div>' +
      '<div class="cal-resumo">' + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>' +
      "<span>Agendado para <b>" + resumo + "</b></span></div>";
    var box = document.getElementById("sched-cal");
    qsa("[data-dia]", box).forEach(function (b) { b.onclick = function () {
      inD.value = b.dataset.dia;
      // se escolheu hoje e o horário já passou, pula pro próximo horário livre
      if (inD.value === hojeStr && new Date(inD.value + "T" + inT.value) <= agora) {
        var prox = new Date(agora.getTime() + 40 * 60000); inT.value = pad2(prox.getHours()) + ":" + (prox.getMinutes() < 30 ? "30" : "00");
        if (prox.getMinutes() >= 30) inT.value = pad2(Math.min(22, prox.getHours() + 1)) + ":00";
      }
      renderCalendario(); }; });
    qsa("[data-hora]", box).forEach(function (b) { b.onclick = function () { inT.value = b.dataset.hora; renderCalendario(); }; });
    document.getElementById("cal-prev").onclick = function () { cal.mes--; if (cal.mes < 0) { cal.mes = 11; cal.ano--; } renderCalendario(); };
    document.getElementById("cal-next").onclick = function () { cal.mes++; if (cal.mes > 11) { cal.mes = 0; cal.ano++; } renderCalendario(); };
  }

  async function onWizNext() {
    if (wizard.step === 1) {
      if (wizard.subjectMode === "topic" && !wizard.topicId) { toast("Escolha um assunto sugerido."); return; }
      if (wizard.subjectMode === "property" && !wizard.propertyId) { toast("Escolha um imóvel para continuar."); return; }
      if (wizard.subjectMode === "custom" && !wizard.customTopic.trim()) { toast("Escreva sobre o que é o carrossel."); return; }
      wizard.step = 2; renderWizard(); return;
    }
    if (wizard.step === 2) {
      if (!wizard.slides) { toast("Gere o conteúdo com IA para continuar."); return; }
      wizard.step = 3; renderWizard(); return;
    }
    if (wizard.step === 3) { wizard.step = 4; renderWizard(); return; }
    if (wizard.step === 4) { await confirmCarousel(); }
  }

  // prévia do carrossel ainda não salvo (passo 4): monta um carrossel temporário com o que está no assistente
  async function verPreviaDoWizard() {
    if (!wizard.slides || !wizard.slides.length) { toast("Gere o conteúdo primeiro."); return; }
    var origem = wizard.subjectMode === "property" ? "imovel" : wizard.subjectMode === "topic" ? "topico" : "custom";
    var tpl = findTemplateBySlug(wizard.templateSlug);
    var temp = {
      _temp: true, origem: origem, template_id: tpl ? tpl.id : null, fonte: fonteDe(wizard.fonte),
      propriedade_id: wizard.propertyId, topico_id: wizard.topicId,
      assunto_custom: wizard.customTopic, categoria: wizard.customCategoria,
      slides: wizard.slides
    };
    await abrirPrevia(temp, "ver");
  }

  async function confirmCarousel() {
    var btn = document.getElementById("wiz-next");
    var origem = wizard.subjectMode === "property" ? "imovel" : wizard.subjectMode === "topic" ? "topico" : "custom";
    var tpl = findTemplateBySlug(wizard.templateSlug);
    var payload = {
      corretor_id: state.profile.id,
      origem: origem,
      template_id: tpl ? tpl.id : null,
      fonte: fonteDe(wizard.fonte),
      direcionamento: wizard.customPrompt || null,
      status: wizard.dest,
      propriedade_id: origem === "imovel" ? wizard.propertyId : null,
      topico_id: origem === "topico" ? wizard.topicId : null,
      assunto_custom: origem === "custom" ? wizard.customTopic.trim() : null,
      categoria: origem === "custom" ? wizard.customCategoria : null
    };

    if (wizard.dest === "agendado") {
      var date = document.getElementById("sched-date").value, time = document.getElementById("sched-time").value || "09:00";
      if (!date) { toast("Escolha a data da publicação."); return; }
      if (new Date(date + "T" + time) <= new Date()) { toast("Esse horário já passou — escolha outro no calendário."); return; }
      payload.data_agendada = new Date(date + "T" + time).toISOString();
      if (wizard.slides.length < 2 || wizard.slides.length > 10) { toast("Pra publicar no feed o carrossel precisa ter de 2 a 10 slides."); return; }
      if (testeSemPublicacoes()) { avisoFimDoTeste(); return; }
    }
    // "com música": a API do Instagram não coloca música, então salva como rascunho e abre o app do Instagram
    var comMusica = wizard.dest === "musica";
    if (comMusica) {
      if (testeSemPublicacoes()) { avisoFimDoTeste(); return; }
      payload.status = "rascunho";
    }

    btn.disabled = true; var orig = btn.textContent; btn.textContent = "Salvando…";
    try {
      var rows = await DB.insert("carrosseis", payload);
      var carrossel = rows[0];
      // PostgREST exige que todo objeto do array tenha exatamente as mesmas chaves num insert em lote —
      // por isso imagem_url/imagem_prompt vão em todas as linhas (null exceto na capa), nunca só condicionalmente.
      var slideRows = wizard.slides.map(function (s, i) {
        return {
          carrossel_id: carrossel.id, ordem: i, tag: s.tag, titulo: s.titulo, corpo: s.corpo,
          // foto real (Pexels) de fundo em todo slide; imagem_prompt guarda o crédito do fotógrafo
          imagem_url: isFotoReal(s.imagem_url) ? s.imagem_url : null,
          imagem_prompt: isFotoReal(s.imagem_url) ? (s.imagem_prompt || null) : null
        };
      });
      var savedSlides = await DB.insert("slides", slideRows);
      carrossel.slides = savedSlides.sort(function (a, b) { return a.ordem - b.ordem; });
      state.carrosseis.unshift(carrossel);

      // O crédito do teste grátis é debitado pelo banco no momento em que o carrossel é salvo
      // (gatilho carrosseis_debitar_teste) — "Gerar novamente" não gasta crédito. O cliente não escreve
      // em trial_usado, só busca o valor atualizado pra refletir na tela.
      if (state.assinatura && state.assinatura.status === "trial") {
        try {
          var freshProfile = await DB.select("profiles", "select=trial_usado,trial_limite&id=eq." + state.profile.id);
          if (freshProfile && freshProfile[0]) {
            state.profile.trial_usado = freshProfile[0].trial_usado;
            state.profile.trial_limite = freshProfile[0].trial_limite;
          }
        } catch (e) { /* não bloqueia o salvamento do carrossel por causa disso */ }
      }
      updateNavPlanBadge();
      if (comMusica) {
        resetWizard(); showScreen("painel");
        postarComMusica(carrossel);
        return;
      }
      if (wizard.dest === "agendado") {
        // gera e sobe agora as imagens do feed: na hora marcada o servidor publica sozinho, mesmo com o app fechado
        try {
          await prepararAgendado(carrossel, function (n, t) { btn.textContent = "Preparando imagens " + n + "/" + t + "…"; });
        } catch (e) {
          toast("Agendado, mas as imagens não foram preparadas (" + e.message + "). Abra o app antes do horário que eu tento de novo.");
        }
      }
      if (wizard.dest === "rascunho") toast("Rascunho salvo.");
      else if (wizard.dest === "agendado") toast("Agendado para " + fmtDateTime(payload.data_agendada) + (state.igConta && state.igConta.status === "ativo" ? " — vai ser publicado sozinho no Instagram." : ". Conecte o Instagram (aba Instagram) até lá pra publicar sozinho."));

      resetWizard(); showScreen("painel");
    } catch (err) {
      if (/teste grátis/i.test(err.message || "")) { toast(err.message); showScreen("plano"); }
      else toast("Erro ao salvar carrossel: " + err.message);
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  /* ============================================================
     INSTAGRAM
  ============================================================ */
  function applyReplyTemplate(tpl, nome) { return (tpl || "").replace(/\{\{\s*nome\s*\}\}/gi, nome); }

  function renderAutoReply() {
    var cfg = state.autoReply || { ativo: true, template: "" };
    var toggleBtn = document.getElementById("autoreply-toggle");
    toggleBtn.textContent = cfg.ativo ? "Ativado · clique pra desligar" : "Desativado · clique pra ligar";
    toggleBtn.className = "btn btn-sm " + (cfg.ativo ? "btn-2" : "btn-ghost");
    toggleBtn.onclick = async function () {
      cfg.ativo = !cfg.ativo;
      try {
        await DB.upsert("autoreply_config", { corretor_id: state.profile.id, ativo: cfg.ativo, template: cfg.template, palavra_gatilho: cfg.palavra_gatilho || "QUERO" }, "corretor_id");
        state.autoReply = cfg; renderAutoReply();
        toast(cfg.ativo ? "Respostas automáticas ativadas." : "Respostas automáticas desativadas.");
      } catch (err) { toast("Erro: " + err.message); }
    };

    var card = document.getElementById("autoreply-card");
    card.style.opacity = cfg.ativo ? "1" : "0.55";
    var ta = document.getElementById("autoreply-template");
    ta.value = cfg.template || "";
    ta.disabled = !cfg.ativo;
    var saveTimer;
    ta.oninput = function () {
      cfg.template = ta.value;
      renderAutoReplyPreview();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async function () {
        try {
          await DB.upsert("autoreply_config", { corretor_id: state.profile.id, ativo: cfg.ativo, template: cfg.template, palavra_gatilho: cfg.palavra_gatilho || "QUERO" }, "corretor_id");
          state.autoReply = cfg;
        } catch (err) { toast("Erro ao salvar: " + err.message); }
      }, 700);
    };

    renderAutoReplyPreview();
  }

  function renderAutoReplyPreview() {
    var cfg = state.autoReply || { template: "" };
    var examples = [
      { nome: "Camila", comentario: "QUERO! Me manda mais informações 🙌" },
      { nome: "Rafael", comentario: "QUERO SABER MAIS" }
    ];
    document.getElementById("autoreply-preview").innerHTML = examples.map(function (ex) {
      var reply = applyReplyTemplate(cfg.template, ex.nome) || "—";
      return '<div class="areply-pair">' +
        '<div class="areply-ex">' +
        '<div class="who">' + escapeHtml(ex.nome.slice(0, 2).toUpperCase()) + '</div>' +
        '<div class="bubble"><b>' + escapeHtml(ex.nome) + ':</b> ' + escapeHtml(ex.comentario) + '</div>' +
        '</div>' +
        '<div class="reply"><div class="who">V</div><div class="bubble">' + escapeHtml(reply) + '</div></div>' +
        '</div>';
    }).join("");
  }

  function renderInstagram() {
    var connected = state.igConta && state.igConta.status === "ativo";
    document.getElementById("ig-connect").innerHTML = connected ?
      ('<div class="l"><div class="ig-icon">' + ICONS.ig + '</div><div><div style="font-weight:700;">@' + escapeHtml(state.igConta.username) + '</div>' +
        '<div style="font-size:12px;color:var(--status-pub-fg);font-weight:600;">Conectado' + (state.igConta.token_expires_at ? ' · acesso válido até ' + fmtDate(state.igConta.token_expires_at) : '') + '</div></div></div>' +
        '<button class="btn btn-ghost btn-sm" id="ig-toggle">Desconectar</button>') +
        (emTeste() ? '<div style="flex-basis:100%;font-size:12.5px;color:var(--ink-muted);margin-top:10px;">Teste grátis: você pode agendar até ' + limitePublicacoesTeste() + ' carrosséis (' + Math.max(limitePublicacoesTeste() - publicadosNoInstagram(), 0) + ' restante' + (limitePublicacoesTeste() - publicadosNoInstagram() === 1 ? "" : "s") + '). As imagens e a legenda levam o link da Vitrine.</div>' : "")
      :
      ('<div class="l"><div class="ig-icon">' + ICONS.ig + '</div><div><div style="font-weight:700;">Nenhuma conta conectada</div>' +
        '<div style="font-size:12px;color:var(--ink-muted);">Conecte sua conta Profissional do Instagram para os posts agendados saírem sozinhos na hora marcada</div></div></div>' +
        '<button class="btn btn-primary btn-sm" id="ig-toggle">Conectar Instagram</button>');
    document.getElementById("ig-toggle").addEventListener("click", async function () {
      try {
        if (connected) {
          await callFunction("instagram-oauth-callback", { acao: "desconectar" });
          state.igConta.status = "inativo";
          renderInstagram();
          toast("Conta desconectada.");
        } else {
          // abre o login do Instagram; ele volta pra Edge Function, que salva o token e redireciona pra cá
          var resp = await callFunction("instagram-oauth-callback", { acao: "iniciar" });
          irPara(resp.url, ["www.instagram.com", "api.instagram.com", "instagram.com"]);
        }
      } catch (err) { toast("Erro: " + err.message); }
    });

    renderAutoReply();

    var sched = state.carrosseis.filter(function (c) { return c.status === "agendado"; }).sort(function (a, b) { return new Date(a.data_agendada) - new Date(b.data_agendada); });
    var pub = state.carrosseis.filter(function (c) { return c.status === "publicado"; }).sort(function (a, b) { return new Date(b.data_publicada) - new Date(a.data_publicada); });

    document.getElementById("queue-scheduled").innerHTML = sched.length ? sched.map(qitemHtml.bind(null, "Publica em")).join("")
      : '<div class="empty-col">Nada agendado no momento.</div>';
    document.getElementById("queue-published").innerHTML = pub.length ? pub.map(qitemHtml.bind(null, "Publicado em")).join("")
      : '<div class="empty-col">Nenhuma publicação ainda.</div>';

    function qitemHtml(label, c) {
      var meta = getSubjectMeta(c);
      var tpl = findTemplateById(c.template_id);
      var slide0 = (c.slides && c.slides[0]) || { tag: "", titulo: meta.titulo, corpo: "" };
      var when = label === "Publica em" ? fmtDateTime(c.data_agendada) : fmtDate(c.data_publicada);
      return '<div class="qitem"><div class="thumb">' + slideTile(slide0, tpl && tpl.slug, true, 1, 1, null, c.fonte) + '</div>' +
        '<div class="body"><h4>' + escapeHtml(meta.titulo) + '</h4><div class="when">' + label + ' ' + when + '</div></div></div>';
    }
  }

  /* ============================================================
     PLANO / PAGAMENTO
  ============================================================ */
  var planPeriod = "mensal", planPending = null, payMethod = "cartao";

  function updateNavPlanBadge() {
    var badge = document.getElementById("nav-plan-count");
    if (!state.assinatura) { badge.hidden = true; return; }
    if (state.assinatura.status === "trial") {
      badge.hidden = false;
      badge.textContent = Math.max((state.profile.trial_limite || 0) - (state.profile.trial_usado || 0), 0) + "/" + (state.profile.trial_limite || 0);
    } else {
      badge.hidden = false;
      var plano = findPlano(state.assinatura.plano_id);
      badge.textContent = (plano ? plano.nome : "PRO").toUpperCase();
    }
  }

  function renderPlano() {
    var statusEl = document.getElementById("plan-status");
    if (!state.assinatura || state.assinatura.status === "trial") {
      var used = (state.profile.trial_usado || 0), limit = (state.profile.trial_limite || 0), left = Math.max(limit - used, 0);
      statusEl.innerHTML = '<div class="plan-banner"><div>' +
        '<h3 style="font-size:17px;margin-bottom:4px;">Teste grátis</h3>' +
        '<p style="margin:0;font-size:13px;color:var(--ink-muted);">' + used + ' de ' + limit + ' carrosséis grátis usados' + (left > 0 ? " · restam " + left : " · limite atingido") + '</p>' +
        '</div><span class="trial-pill' + (left <= 0 ? " full" : "") + '"><span class="dot"></span>' + (left > 0 ? left + " restante" + (left > 1 ? "s" : "") : "sem créditos") + '</span></div>';
    } else if (state.assinatura.equipe_id) {
      var planoEq = findPlano(state.assinatura.plano_id);
      statusEl.innerHTML = '<div class="plan-banner pro"><div>' +
        '<h3 style="font-size:17px;margin-bottom:4px;">Acesso pela imobiliária' + (equipeInfo && equipeInfo.equipe && equipeInfo.equipe.nome ? " · " + escapeHtml(equipeInfo.equipe.nome) : "") + '</h3>' +
        '<p style="margin:0;font-size:13px;color:var(--ink-muted);">' + (planoEq ? escapeHtml(planoEq.nome) + " · " : "") + 'carrosséis ilimitados, pago pela sua imobiliária</p>' +
        '</div><button class="btn btn-ghost btn-sm" id="ir-equipe">Ver equipe</button></div>';
      document.getElementById("ir-equipe").addEventListener("click", function () { showScreen("equipe"); });
    } else {
      var plano = findPlano(state.assinatura.plano_id);
      statusEl.innerHTML = '<div class="plan-banner pro"><div>' +
        '<h3 style="font-size:17px;margin-bottom:4px;">Vitrine ' + (plano ? escapeHtml(plano.nome) : "Pro") + ' ativo</h3>' +
        '<p style="margin:0;font-size:13px;color:var(--ink-muted);">Assinante desde ' + fmtDate(state.assinatura.data_inicio) + ' · carrosséis ilimitados</p>' +
        '</div><button class="btn btn-ghost btn-sm" id="cancel-plan">Cancelar assinatura</button></div>';
      var cancelBtn = document.getElementById("cancel-plan");
      if (cancelBtn) cancelBtn.addEventListener("click", async function () {
        try {
          // cancelamento e o reset do contador de trial são feitos pela Edge Function (service role) —
          // o cliente não tem mais permissão de escrever em assinaturas/trial_usado diretamente.
          if (!confirm("Cancelar a assinatura? A cobrança recorrente no cartão será encerrada.")) return;
          var resp = await callFunction("stripe-cancel", {});
          if (resp.pendente) { toast("Cancelamento enviado — atualize a página em instantes."); return; }
          state.assinatura = resp.assinatura;
          state.profile.trial_usado = 0;
          updateNavPlanBadge(); renderPlano(); toast("Assinatura cancelada — voltando ao teste grátis.");
        } catch (err) { toast("Erro: " + err.message); }
      });
    }

    var promoHtml = promoAtiva() ? '<div class="promo-plano" style="grid-column:1/-1;"><b>Oferta para novos assinantes:</b> 30% off no 1º mês do plano mensal, aplicado automaticamente no pagamento.</div>' : "";
    document.getElementById("plan-grid").innerHTML = promoHtml +
      '<div class="toggle-period" style="grid-column:1/-1;">' +
      '<button data-period="mensal" class="' + (planPeriod === "mensal" ? "active" : "") + '">Mensal</button>' +
      '<button data-period="anual" class="' + (planPeriod === "anual" ? "active" : "") + '">Anual · 2 meses grátis</button>' +
      '</div>' +
      state.planos.filter(function (p) { return p.tipo !== "equipe"; }).map(function (p) {
        var preco = planPeriod === "anual" ? p.preco_anual : p.preco_mensal;
        var isCurrent = state.assinatura && state.assinatura.status === "ativa" && state.assinatura.plano_id === p.id;
        return '<div class="plan-card ' + (p.destaque ? "featured" : "") + '">' +
          (p.destaque ? '<span class="badge">Mais escolhido</span>' : "") +
          '<h3>' + escapeHtml(p.nome) + '</h3>' +
          '<div class="plan-price mono">' + fmtBRL(preco) + ' <span>/' + (planPeriod === "anual" ? "ano" : "mês") + '</span></div>' +
          '<ul class="plan-feats">' + (p.recursos || []).map(function (f) { return '<li>' + ICONS.check + escapeHtml(f) + '</li>'; }).join("") + '</ul>' +
          '<button class="btn ' + (p.destaque ? "btn-primary" : "btn-2") + '" style="width:100%;justify-content:center;" data-subscribe="' + p.id + '" ' + (isCurrent ? "disabled" : "") + '>' +
          (isCurrent ? "Plano atual" : "Assinar " + escapeHtml(p.nome)) + '</button></div>';
      }).join("");

    var equipes = state.planos.filter(function (p) { return p.tipo === "equipe"; });
    document.getElementById("plan-grid-equipe").innerHTML = equipes.length ? '<h3 class="plan-sec-title">Planos para imobiliárias</h3><p class="plan-sec-sub">Você assina e convida seus corretores por link — cada um usa a própria conta com tudo do Pro. Você conta como 1 corretor.</p>' +
      equipes.map(function (p) {
        var preco = planPeriod === "anual" ? p.preco_anual : p.preco_mensal;
        var isCurrent = state.assinatura && state.assinatura.status === "ativa" && state.assinatura.plano_id === p.id && !state.assinatura.equipe_id;
        var porCorretor = Number(p.preco_mensal) / (p.max_corretores || 1);
        return '<div class="plan-card ' + (p.destaque ? "featured" : "") + '">' + (p.destaque ? '<span class="badge">Melhor custo</span>' : "") +
          '<h3>' + escapeHtml(p.nome) + '</h3>' +
          '<div class="plan-price mono">' + fmtBRL(preco) + ' <span>/' + (planPeriod === "anual" ? "ano" : "mês") + '</span></div>' +
          '<div style="font-size:12px;color:var(--ink-muted);margin:-4px 0 10px;">≈ R$ ' + porCorretor.toFixed(2).replace(".", ",") + ' por corretor/mês</div>' +
          '<ul class="plan-feats">' + (p.recursos || []).map(function (f) { return '<li>' + ICONS.check + escapeHtml(f) + '</li>'; }).join("") + '</ul>' +
          '<button class="btn ' + (p.destaque ? "btn-primary" : "btn-2") + '" style="width:100%;justify-content:center;" data-subscribe="' + escapeHtml(p.id) + '" ' + (isCurrent ? "disabled" : "") + '>' + (isCurrent ? "Plano atual" : "Assinar " + escapeHtml(p.nome)) + '</button></div>';
      }).join("") +
      '<div class="plan-card"><h3>50+ corretores</h3><div class="plan-price mono">R$ 59,90 <span>/corretor</span></div>' +
      '<ul class="plan-feats"><li>' + ICONS.check + 'Rede ou imobiliária grande</li><li>' + ICONS.check + 'Tudo do Pro para cada corretor</li><li>' + ICONS.check + 'Condição sob medida</li></ul>' +
      '<a class="btn btn-2" style="width:100%;justify-content:center;text-decoration:none;" href="mailto:' + SUPORTE_EMAIL + '?subject=' + encodeURIComponent("Plano 50+ corretores") + '">Falar com a Vitrine</a></div>' : "";
    qsa("[data-period]").forEach(function (b) { b.addEventListener("click", function () { planPeriod = b.dataset.period; renderPlano(); }); });
    qsa("[data-subscribe]").forEach(function (b) { b.addEventListener("click", function () { planPending = b.dataset.subscribe; renderCheckout(); }); });
    document.getElementById("checkout-box").hidden = !planPending;
    if (planPending) renderCheckout();
  }

  function renderCheckout() {
    var plano = findPlano(planPending);
    if (!plano) return;
    var preco = planPeriod === "anual" ? plano.preco_anual : plano.preco_mensal;
    var box = document.getElementById("checkout-box");
    box.hidden = false;
    box.innerHTML = '<div class="checkout-card">' +
      '<h3 style="font-size:16px;margin-bottom:14px;">Assinar Vitrine ' + escapeHtml(plano.nome) + '</h3>' +
      '<div class="checkout-summary"><span>' + escapeHtml(plano.nome) + ' · ' + (planPeriod === "anual" ? "anual" : "mensal") + '</span><span class="mono">' + fmtBRL(preco) + '</span></div>' +
      '<p style="font-size:12px;color:var(--ink-muted);margin:0 0 12px;">Você será levado ao checkout seguro do Stripe para pagar com cartão de crédito. A Vitrine não vê nem guarda os dados do seu cartão.</p>' +
      '<button class="btn btn-primary" id="confirm-sub" style="width:100%;justify-content:center;">Ir para o pagamento</button>' +
      '<button class="btn btn-ghost btn-sm" id="cancel-checkout" style="width:100%;justify-content:center;margin-top:8px;">Cancelar</button></div>';
    document.getElementById("cancel-checkout").addEventListener("click", function () { planPending = null; box.hidden = true; box.innerHTML = ""; });
    document.getElementById("confirm-sub").addEventListener("click", async function () {
      var btn = this;
      btn.disabled = true; btn.innerHTML = '<div class="spin" style="border-top-color:#fff; border-color:rgba(255,255,255,0.35);"></div> Abrindo checkout…';
      try {
        // a ativação do plano acontece só no servidor, pelo webhook do Stripe, depois do pagamento confirmado
        var resp = await callFunction("stripe-checkout", { plano_id: plano.id, periodo: planPeriod });
        irPara(resp.url, ["checkout.stripe.com"]);
      } catch (err) {
        toast("Erro: " + err.message);
        btn.disabled = false; btn.textContent = "Ir para o pagamento";
      }
    });
  }

  // trata o retorno do Stripe (?checkout=...) e do Instagram (?instagram=...)
  async function handleReturnParams() {
    var params = new URLSearchParams(location.search);
    var ck = params.get("checkout"), ig = params.get("instagram");
    if (!ck && !ig) return;
    history.replaceState(null, "", location.pathname);
    if (ck === "cancelado") toast("Pagamento cancelado — nada foi cobrado.");
    if (ck === "sucesso") {
      toast("Pagamento recebido! Ativando seu plano…");
      // o webhook pode levar alguns segundos: consulta até a assinatura virar "ativa"
      for (var i = 0; i < 10; i++) {
        var rows = await DB.select("assinaturas", "select=*&corretor_id=eq." + state.profile.id + "&status=eq.ativa&limit=1");
        if (rows && rows[0]) { state.assinatura = rows[0]; break; }
        await new Promise(function (r) { setTimeout(r, 1500); });
      }
      updateNavPlanBadge();
      showScreen("plano");
      toast(state.assinatura && state.assinatura.status === "ativa" ? "Plano ativado. Bem-vindo à Vitrine Pro!" : "Pagamento em processamento — o plano aparece em instantes.");
    }
    var igMsgs = { conectado: "Instagram conectado!", negado: "Conexão com o Instagram cancelada.", expirado: "O link de conexão expirou — tente de novo.", erro: "Não foi possível conectar o Instagram. Verifique se a conta é Profissional (Empresa ou Criador)." };
    if (ig) {
      if (ig === "conectado") {
        var c = await DB.select("instagram_contas", "select=*&corretor_id=eq." + state.profile.id + "&limit=1");
        state.igConta = (c || [])[0] || null;
      }
      showScreen("instagram");
      toast(igMsgs[ig] || igMsgs.erro);
    }
  }

  /* ============================================================
     BOOT
  ============================================================ */
  function wireNav() {
    qsa(".navitem").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.screen === "novo") { if (!tryStartWizard()) return; }
        showScreen(b.dataset.screen);
      });
    });
    document.getElementById("overlay").addEventListener("click", function (e) { if (e.target.id === "overlay") closeModal(); });
    document.getElementById("logout-btn").addEventListener("click", async function () {
      if (!window.confirm("Sair da sua conta na Vitrine?")) return;
      await Auth.signOut();
      document.getElementById("app-view").hidden = true;
      authMode = "login";
      document.getElementById("auth-view").hidden = false;
      renderAuthView();
    });
    wireStep1Once();
  }
  var navWired = false;

  async function loadAllData() {
    var uid = state.profile.id;
    var results = await Promise.all([
      DB.select("planos", "select=*&order=ordem.asc"),
      DB.select("topicos", "select=*&ativo=eq.true"),
      DB.select("templates", "select=*&ativo=eq.true"),
      DB.select("propriedades", "select=*&corretor_id=eq." + uid + "&order=created_at.desc"),
      DB.select("assinaturas", "select=*&corretor_id=eq." + uid + "&status=in.(trial,ativa)&limit=1"),
      DB.select("instagram_contas", "select=*&corretor_id=eq." + uid + "&limit=1"),
      DB.select("autoreply_config", "select=*&corretor_id=eq." + uid + "&limit=1"),
      DB.select("carrosseis", "select=*,slides(*)&corretor_id=eq." + uid + "&order=created_at.desc")
    ]);
    state.planos = results[0] || [];
    state.topicos = results[1] || [];
    state.templates = results[2] || [];
    state.propriedades = results[3] || [];
    state.assinatura = (results[4] || [])[0] || null;
    state.igConta = (results[5] || [])[0] || null;
    state.autoReply = (results[6] || [])[0] || { ativo: true, template: "Oi {{nome}}! Que bom o seu interesse 😊 Já te chamo aqui pra conversarmos com mais detalhes sobre esse imóvel. Precisa de mais alguma informação?", palavra_gatilho: "QUERO" };
    state.carrosseis = (results[7] || []).map(function (c) {
      c.slides = (c.slides || []).slice().sort(function (a, b) { return a.ordem - b.ordem; });
      return c;
    });

    if (!state.assinatura) {
      // rede de segurança: o trial já é criado pelo backend no cadastro (trigger handle_new_user).
      // Isso só roda se, por algum motivo, essa linha ainda não existir — e passa pela Edge Function
      // (não por um INSERT direto do cliente), porque o cliente não tem mais permissão de escrever em assinaturas.
      var resp = await callFunction("gerenciar-assinatura", { acao: "iniciar_trial" });
      state.assinatura = resp.assinatura;
    }
    // não trava a abertura do app: prepara em segundo plano as imagens de agendados antigos
    setTimeout(function () { prepararAgendadosPendentes(); }, 1500);
  }

  // visitante sem login vê a página de captação; os botões abrem o cadastro (teste grátis) ou o login
  var landingWired = false;
  function showLanding() {
    document.getElementById("auth-view").hidden = true;
    document.getElementById("landing-view").hidden = false;
    if (!landingWired) {
      landingWired = true;
      qsa("#landing-view [data-cta]").forEach(function (b) { b.addEventListener("click", function () { openAuth(b.dataset.cta); }); });
    }
    window.scrollTo(0, 0); document.body.scrollTop = 0; document.documentElement.scrollTop = 0;
  }
  function openAuth(mode) {
    authMode = mode === "login" ? "login" : "signup";
    document.getElementById("landing-view").hidden = true;
    document.getElementById("auth-view").hidden = false;
    renderAuthView();
    window.scrollTo(0, 0); document.body.scrollTop = 0; document.documentElement.scrollTop = 0;
  }

  // anti-clickjacking: o GitHub Pages não deixa mandar X-Frame-Options, então o app se recusa a rodar dentro de iframe de outro site
  if (window.top !== window.self) { try { window.top.location = window.self.location.href; } catch (e) { document.documentElement.innerHTML = ""; } }

  // fallback de imagem quebrada (substitui o antigo onerror inline)
  document.addEventListener("error", function (e) {
    var t = e.target;
    if (t && t.tagName === "IMG" && t.dataset && t.dataset.fb) {
      var h = (window.__vitrineFallback || {})[t.dataset.fb];
      if (h) t.outerHTML = h; else t.remove();
    }
  }, true);

  async function bootApp() {
    document.getElementById("landing-view").hidden = true;
    var loading = document.getElementById("loading-shell");
    var authView = document.getElementById("auth-view");
    var appView = document.getElementById("app-view");
    loading.hidden = false; authView.hidden = true; appView.hidden = true;

    var temConvite = guardarConviteDaUrl();
    var session = Auth.load();
    if (!session) {
      loading.hidden = true;
      if (temConvite) { openAuth("signup"); toast("Você foi convidado para a equipe de uma imobiliária na Vitrine. Crie sua conta (ou entre) com o e-mail do convite."); }
      else if (/entrar|login/.test(location.hash)) openAuth("login");
      else if (/teste|cadastro/.test(location.hash)) openAuth("signup");
      else showLanding();
      return;
    }
    try {
      await Auth.ensureValidToken();
      if (!Auth.get()) throw new Error("sessão expirada");

      var uid = session.user ? session.user.id : (Auth.get().user ? Auth.get().user.id : null);
      var profiles = await DB.select("profiles", "select=*&id=eq." + uid);
      if (!profiles || !profiles.length) throw new Error("perfil não encontrado");
      state.profile = profiles[0];

      await loadAllData();

      loading.hidden = true;
      authView.hidden = true;
      appView.hidden = false;

      document.getElementById("sidebar-avatar").textContent = (state.profile.nome || "?").slice(0, 1).toUpperCase();
      document.getElementById("sidebar-name").textContent = state.profile.nome || state.profile.email;
      document.getElementById("workspace-name").textContent = state.profile.nome ? state.profile.nome + " · Vitrine" : "Vitrine";

      document.getElementById("nav-admin").hidden = !ehAdmin();
      carregarEquipe().then(aceitarConvitePendente);
      if (!navWired) { wireNav(); navWired = true; }
      updateNavPlanBadge();
      resetWizard();
      // página inicial depois do login: criar carrossel (se o teste acabou, vai pro Plano)
      if (trialBlocked()) showScreen("painel"); else showScreen("novo");
      prepararAssuntos();
      handleReturnParams().catch(function (e) { console.error(e); });
    } catch (err) {
      await Auth.signOut();
      loading.hidden = true;
      authMode = "login";
      authView.hidden = false;
      renderAuthView("Sua sessão expirou. Entre novamente.");
    }
  }

  bootApp();
})();

