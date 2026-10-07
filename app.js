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
    var grads = { apartamento: ["#1E4FCC", "#3D7FFF"], terreno: ["#0B1B3A", "#3D7FFF"], casa: ["#3D7FFF", "#22D3EE"] };
    var g = grads[tipo] || grads.apartamento;
    var shape = tipo === "terreno"
      ? '<path d="M20 78 L44 30 L60 52 L74 26 L100 78 Z" fill="rgba(255,255,255,0.9)"/><circle cx="86" cy="24" r="7" fill="rgba(255,255,255,0.9)"/>'
      : '<path d="M20 80 V44 L60 20 L100 44 V80 Z" fill="rgba(255,255,255,0.92)"/><rect x="52" y="58" width="16" height="22" fill="' + g[0] + '"/><rect x="30" y="52" width="12" height="12" fill="' + g[0] + '"/><rect x="78" y="52" width="12" height="12" fill="' + g[0] + '"/>';
    return '<svg viewBox="0 0 120 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')">' + shape + '</svg>';
  }
  function topicCoverSvg(categoria) {
    var g = { Dicas: ["#3D7FFF", "#22D3EE"], Financiamento: ["#0B1B3A", "#3D7FFF"], Vendas: ["#1E4FCC", "#22D3EE"], Mercado: ["#080A10", "#3D7FFF"] }[categoria] || ["#3D7FFF", "#22D3EE"];
    var shape;
    if (categoria === "Financiamento") shape = '<circle cx="40" cy="66" r="16" fill="rgba(255,255,255,0.92)"/><circle cx="62" cy="52" r="16" fill="rgba(255,255,255,0.75)"/><circle cx="86" cy="66" r="16" fill="rgba(255,255,255,0.92)"/>';
    else if (categoria === "Vendas") shape = '<path d="M18 74 L40 54 L56 66 L96 24" stroke="rgba(255,255,255,0.95)" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M78 24 H96 V42" stroke="rgba(255,255,255,0.95)" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    else if (categoria === "Mercado") shape = '<rect x="18" y="46" width="14" height="34" fill="rgba(255,255,255,0.85)"/><rect x="38" y="30" width="14" height="50" fill="rgba(255,255,255,0.95)"/><rect x="58" y="52" width="14" height="28" fill="rgba(255,255,255,0.8)"/><rect x="78" y="20" width="14" height="60" fill="rgba(255,255,255,0.92)"/>';
    else shape = '<circle cx="60" cy="48" r="20" fill="rgba(255,255,255,0.92)"/><path d="M60 76v8M40 88h40" stroke="rgba(255,255,255,0.92)" stroke-width="6" stroke-linecap="round"/><path d="M52 48l6 6 10-12" stroke="' + g[0] + '" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    return '<svg viewBox="0 0 120 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')">' + shape + '</svg>';
  }
  function customCoverSvg() {
    return '<svg viewBox="0 0 120 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="background:linear-gradient(135deg,#0B1B3A,#22D3EE)">' +
      '<circle cx="60" cy="50" r="6" fill="rgba(255,255,255,0.95)"/>' +
      '<path d="M60 50L30 20M60 50L90 20M60 50L24 60M60 50L96 60M60 50L34 84M60 50L86 84" stroke="rgba(255,255,255,0.65)" stroke-width="4" stroke-linecap="round"/></svg>';
  }

  // capa gerada por IA de verdade (Pollinations.ai — grátis, sem chave): monta o <img>, com o SVG como fallback caso a imagem falhe.
  function imgWithFallback(url, fallbackSvg) {
    var id = "img" + Math.random().toString(36).slice(2, 9);
    window.__vitrineFallback = window.__vitrineFallback || {};
    window.__vitrineFallback[id] = fallbackSvg;
    return '<img src="' + url + '" alt="" loading="lazy" onerror="var h=window.__vitrineFallback[\'' + id + '\']; if(h){ this.outerHTML = h; }">';
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
      faltando[k].s.imagem_url = foto.url;
      faltando[k].s.imagem_prompt = foto.credito;   // guarda o crédito do fotógrafo
      if (salvarNoBanco && faltando[k].s.id) {
        try { await DB.update("slides", "id=eq." + faltando[k].s.id, { imagem_url: foto.url, imagem_prompt: foto.credito }); } catch (e) { }
      }
    }
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
    if (capa && isFotoReal(capa.imagem_url)) meta.art = imgWithFallback(escapeHtml(capa.imagem_url), meta.art);
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

  /* ---------------- slide tile renderer ---------------- */
  function slideTile(slide, tplSlug, mini, index, total, art) {
    // imagem relacionada sempre por baixo do texto (fundo do slide inteiro), com o SVG/cor do template como fallback
    var foto = mini ? null : slideImageUrl(slide);
    var artHtml = foto ? '<div class="tile-bg">' + imgWithFallback(escapeHtml(foto), "") + '</div>' : "";
    return '<div class="slide-tile ' + (mini ? "mini " : "") + (foto ? "has-bg " : "") + 'tpl-' + (tplSlug || "minimalista") + '">' + artHtml +
      '<div class="stag">' + escapeHtml(slide.tag || "") + '</div>' +
      '<div class="stitle">' + escapeHtml(slide.titulo) + '</div>' +
      '<div class="sbody">' + escapeHtml(slide.corpo) + '</div>' +
      (mini ? "" : '<div class="sindex">' + index + "/" + total + "</div>") +
      "</div>";
  }
  function slideStrip(slides, tplSlug, mini, art) {
    return (slides || []).map(function (s, i) { return slideTile(s, tplSlug, mini, i + 1, slides.length, i === 0 ? art : null); }).join("");
  }


  /* ============================================================
     RENDER DOS SLIDES EM JPEG (1080×1350, 4:5) — o Instagram só aceita imagem
  ============================================================ */
  var SLIDE_W = 1080, SLIDE_H = 1350;
  var SLIDE_THEMES = {
    minimalista: { bg: ["#10131C", "#10131C"], ink: "#EEF0F6", tag: "#3D7FFF", border: "#242A38" },
    vibrante: { bg: ["#3D7FFF", "#1E4FCC"], ink: "#FFFFFF", tag: "rgba(255,255,255,0.85)", border: "#3D7FFF" },
    editorial: { bg: ["#080A10", "#0F1B33"], ink: "#EEF0F6", tag: "#22D3EE", border: "#22D3EE" }
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

  async function renderSlideJpeg(slide, i, total, tplSlug, bgImg) {
    var th = SLIDE_THEMES[tplSlug] || SLIDE_THEMES.minimalista;
    var cv = document.createElement("canvas"); cv.width = SLIDE_W; cv.height = SLIDE_H;
    var ctx = cv.getContext("2d");
    var g = ctx.createLinearGradient(0, 0, SLIDE_W * 0.6, SLIDE_H);
    g.addColorStop(0, th.bg[0]); g.addColorStop(1, th.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);

    var pad = 96, top = pad;
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
      if (tplSlug === "vibrante") tagColor = "#9CC0FF";
    }

    var family = '"Plus Jakarta Sans", sans-serif', display = '"Bricolage Grotesque", "Plus Jakarta Sans", sans-serif';
    ctx.textBaseline = "top";
    if (slide.tag) {
      ctx.fillStyle = tagColor; ctx.font = "700 34px " + family;
      ctx.fillText(String(slide.tag).toUpperCase(), pad, top);
      top += 64;
    }
    var bottomLimit = SLIDE_H - pad - 60;          // reserva espaço do contador
    var avail = bottomLimit - top;
    var title = fitText(ctx, slide.titulo, { size: i === 0 ? 96 : 80, min: 44, weight: 800, family: display, maxW: SLIDE_W - pad * 2, maxH: avail * 0.55, lh: 1.08 });
    ctx.fillStyle = ink; ctx.font = "800 " + title.size + "px " + display;
    title.lines.forEach(function (l, k) { ctx.fillText(l, pad, top + k * title.size * 1.08); });

    var bodyMaxH = avail - title.height - 48;
    var body = fitText(ctx, slide.corpo, { size: 44, min: 26, weight: 500, family: family, maxW: SLIDE_W - pad * 2, maxH: bodyMaxH, lh: 1.38 });
    ctx.globalAlpha = 0.92; ctx.font = "500 " + body.size + "px " + family;
    var by = bottomLimit - body.height;           // corpo alinhado embaixo, como no preview
    body.lines.forEach(function (l, k) { ctx.fillText(l, pad, by + k * body.size * 1.38); });
    ctx.globalAlpha = 0.7; ctx.font = "500 30px \"JetBrains Mono\", monospace"; ctx.textAlign = "right";
    ctx.fillText((i + 1) + "/" + total, SLIDE_W - pad, SLIDE_H - pad - 30);
    ctx.globalAlpha = 1; ctx.textAlign = "left";

    return new Promise(function (resolve, reject) {
      try { cv.toBlob(function (b) { b ? resolve(b) : reject(new Error("Falha ao gerar imagem.")); }, "image/jpeg", 0.9); }
      catch (e) { reject(e); }
    });
  }

  async function uploadSlide(blob, path) {
    await Auth.ensureValidToken();
    var s = Auth.get();
    var res = await fetch(SUPABASE_URL + "/storage/v1/object/slides-render/" + path, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + s.access_token, "Content-Type": "image/jpeg" },
      body: blob
    });
    if (!res.ok) throw new Error("Upload da imagem falhou: " + (await res.text().catch(function () { return res.status; })));
    return SUPABASE_URL + "/storage/v1/object/public/slides-render/" + path;
  }

  // gera os JPEGs de todos os slides em memória (ainda não sobe nada)
  async function renderCarouselBlobs(c, onProgress) {
    var tpl = findTemplateById(c.template_id);
    var slug = (tpl && tpl.slug) || "minimalista";
    try { await Promise.all([document.fonts.load('800 80px "Bricolage Grotesque"'), document.fonts.load('500 44px "Plus Jakarta Sans"'), document.fonts.load('700 34px "Plus Jakarta Sans"')]); } catch (e) { }
    try { await garantirFotosReais(c.slides, contextoDoCarrossel(c), true); }
    catch (e) { toast("Não consegui buscar as fotos: " + e.message); }
    var out = [];
    for (var i = 0; i < c.slides.length; i++) {
      var sl = c.slides[i];
      if (onProgress) onProgress(i + 1, c.slides.length);
      var img = slideImageUrl(sl) ? await loadImage(slideImageUrl(sl)) : null;
      var blob = await renderSlideJpeg(sl, i, c.slides.length, slug, img);
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

  function legendaPadrao(c) { return c.legenda || c.slides.map(function (s) { return s.titulo; }).join(" · "); }

  // prévia no formato de post do Instagram: o corretor vê exatamente as imagens que serão publicadas.
  // modo "publicar" → botões Voltar / Publicar (resolve true/false). modo "ver" → só Fechar.
  function showPostPreview(c, blobs, modo) {
    return new Promise(function (resolve) {
      var idx = 0, user = (state.igConta && state.igConta.status === "ativo" && state.igConta.username) || (state.profile.nome || "seu_perfil").toLowerCase().replace(/\s+/g, "");
      var body = document.getElementById("modal-body");
      function done(v) { blobs.forEach(function (b) { if (modo === "ver") URL.revokeObjectURL(b.url); }); closeModal(); resolve(v); }
      function draw() {
        body.innerHTML =
          '<div class="modal-head"><div><h3 style="font-size:18px;">Como vai ficar no Instagram</h3>' +
          '<p style="margin:4px 0 0;font-size:12.5px;color:var(--ink-muted);">' + (modo === "publicar" ? "Confira cada slide antes de publicar." : "Prévia das imagens finais do carrossel.") + '</p></div>' +
          '<button class="modal-close" id="pv-close">' + ICONS.close + '</button></div>' +
          '<div class="igpv"><div class="igpv-head"><div class="igpv-av">' + escapeHtml(user.slice(0, 1).toUpperCase()) + '</div><b>' + escapeHtml(user) + '</b></div>' +
          '<div class="igpv-media"><img src="' + blobs[idx].url + '" alt="Slide ' + (idx + 1) + '">' +
          (idx > 0 ? '<button class="igpv-nav l" id="pv-prev" aria-label="Anterior">‹</button>' : '') +
          (idx < blobs.length - 1 ? '<button class="igpv-nav r" id="pv-next" aria-label="Próximo">›</button>' : '') +
          '<span class="igpv-count">' + (idx + 1) + '/' + blobs.length + '</span></div>' +
          '<div class="igpv-dots">' + blobs.map(function (b, k) { return '<span class="' + (k === idx ? "on" : "") + '"></span>'; }).join("") + '</div>' +
          '<div class="igpv-cap"><b>' + escapeHtml(user) + '</b> ' + escapeHtml(legendaPadrao(c)) + '</div></div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">' +
          (modo === "publicar"
            ? '<button class="btn btn-ghost btn-sm" id="pv-back">Voltar e ajustar</button><button class="btn btn-primary btn-sm" id="pv-ok">' + ICONS.ig + ' Publicar no Instagram</button>'
            : '<button class="btn btn-ghost btn-sm" id="pv-back">Fechar</button>') + '</div>';
        document.getElementById("pv-close").onclick = function () { done(false); };
        document.getElementById("pv-back").onclick = function () { done(false); };
        var ok = document.getElementById("pv-ok"); if (ok) ok.onclick = function () { done(true); };
        var pr = document.getElementById("pv-prev"); if (pr) pr.onclick = function () { idx--; draw(); };
        var nx = document.getElementById("pv-next"); if (nx) nx.onclick = function () { idx++; draw(); };
      }
      draw();
      document.getElementById("overlay").hidden = false;
    });
  }

  async function previewCarousel(c, btn) {
    if (!c.slides || !c.slides.length) { toast("Este carrossel não tem slides."); return; }
    var orig = btn ? btn.innerHTML : "";
    if (btn) btn.disabled = true;
    try {
      var blobs = await renderCarouselBlobs(c, function (n, t) { if (btn) btn.innerHTML = '<div class="spin"></div> Gerando ' + n + "/" + t + "…"; });
      await showPostPreview(c, blobs, "ver");
    } catch (err) { toast("Erro ao gerar a prévia: " + err.message); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = orig; } }
  }

  async function publishToInstagram(c, btn) {
    if (!(state.igConta && state.igConta.status === "ativo")) { toast("Conecte o Instagram primeiro (aba Instagram)."); return false; }
    if (!c.slides || c.slides.length < 2) { toast("O Instagram exige pelo menos 2 slides."); return false; }
    if (c.slides.length > 10) { toast("O Instagram aceita no máximo 10 slides."); return false; }
    var orig = btn ? btn.innerHTML : "";
    function label(t) { if (btn) btn.innerHTML = '<div class="spin"></div> ' + t; }
    if (btn) btn.disabled = true;
    try {
      var blobs = await renderCarouselBlobs(c, function (n, t) { label("Gerando imagem " + n + "/" + t + "…"); });
      if (btn) { btn.disabled = false; btn.innerHTML = orig; }
      var aprovado = await showPostPreview(c, blobs, "publicar");   // sempre mostra como ficou antes de postar
      blobs.forEach(function (b) { setTimeout(function () { URL.revokeObjectURL(b.url); }, 60000); });
      if (!aprovado) { toast("Publicação cancelada — nada foi enviado ao Instagram."); return false; }
      if (btn) btn.disabled = true;
      await uploadCarouselBlobs(c, blobs, function (n, t) { label("Enviando imagem " + n + "/" + t + "…"); });
      label("Publicando no Instagram…");
      var resp = await callFunction("instagram-publicar", { carrossel_id: c.id, legenda: legendaPadrao(c) });
      c.status = "publicado"; c.data_publicada = resp.data_publicada; c.instagram_permalink = resp.permalink;
      toast("Publicado no Instagram!");
      return true;
    } catch (err) {
      toast("Erro ao publicar: " + err.message);
      return false;
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
  }

  /* ============================================================
     AUTH UI
  ============================================================ */
  var authMode = "login";
  function renderAuthView(errorMsg, noteMsg) {
    var view = document.getElementById("auth-view");
    view.innerHTML =
      '<div class="auth-shell"><div class="auth-card">' +
      '<div class="auth-brand"><div class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.4"/><path d="M12 4v3.2M12 16.8V20M4 12h3.2M16.8 12H20M6.3 6.3l2.3 2.3M15.4 15.4l2.3 2.3M6.3 17.7l2.3-2.3M15.4 8.6l2.3-2.3"/></svg></div>' +
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
    novo: ["Novo carrossel", "IA gera o conteúdo, você ajusta o estilo e agenda."],
    instagram: ["Instagram", "Conexão e fila de publicação."],
    plano: ["Plano", "Seu teste grátis e sua assinatura da Vitrine."]
  };

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
    if (name === "novo" && wizard.step === 1) renderWizard();
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
          '<div class="thumb">' + slideTile(slide0, tpl && tpl.slug, true) + '</div>' +
          '<div class="body">' +
          '<h4>' + escapeHtml(meta.titulo) + '</h4>' +
          '<div class="addr">' + escapeHtml(meta.sub) + '</div>' +
          '<div class="meta">' + when + '</div>' +
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
    var igOk = state.igConta && state.igConta.status === "ativo";
    var extra = c.status === "publicado"
      ? (c.instagram_permalink ? '<a class="btn btn-ghost btn-sm" href="' + escapeHtml(c.instagram_permalink) + '" target="_blank" rel="noopener">' + ICONS.ig + ' Ver no Instagram</a>' : "")
      : '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">' +
        '<button class="btn btn-ghost btn-sm" id="preview-ig">' + ICONS.eye + ' Ver como fica</button>' +
        (c.status === "agendado" ? '<button class="btn btn-ghost btn-sm" id="mark-published">' + ICONS.check + ' Marcar como publicado</button>' : "") +
        '<button class="btn btn-primary btn-sm" id="publish-ig"' + (igOk ? "" : ' title="Conecte o Instagram na aba Instagram"') + '>' + ICONS.ig + ' Publicar no Instagram</button></div>';
    document.getElementById("modal-body").innerHTML =
      '<div class="modal-head"><div><h3 style="font-size:19px;">' + escapeHtml(meta.titulo) + '</h3>' +
      '<span class="pill ' + pillCls + '" style="margin-top:6px;">' + c.status + '</span></div>' +
      '<button class="modal-close" id="modal-close">' + ICONS.close + '</button></div>' +
      '<div class="carousel-strip">' + slideStrip(c.slides, tpl && tpl.slug, false, meta.art) + '</div>' +
      (c.direcionamento ? '<div style="font-size:12px;color:var(--ink-muted);margin-bottom:8px;"><strong>Direcionamento usado:</strong> ' + escapeHtml(c.direcionamento) + '</div>' : "") +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">' +
      '<span style="font-size:12px;color:var(--ink-faint);">' + escapeHtml(meta.sub) + '</span>' + extra + '</div>';
    document.getElementById("overlay").hidden = false;
    document.getElementById("modal-close").addEventListener("click", closeModal);
    var pv = document.getElementById("preview-ig");
    if (pv) pv.addEventListener("click", async function () { await previewCarousel(c, pv); openCarouselModal(c.id); });
    var pi = document.getElementById("publish-ig");
    if (pi) pi.addEventListener("click", async function () {
      if (await publishToInstagram(c, pi)) { closeModal(); renderPainel(); renderInstagram(); }
      else if (document.getElementById("overlay").hidden) openCarouselModal(c.id);
    });
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

  function propCardHtml(p) {
    var specs = p.tipo === "terreno"
      ? '<span>' + ICONS.ruler + (p.area_m2 || 0) + ' m²</span>'
      : '<span>' + ICONS.ruler + (p.area_m2 || 0) + ' m²</span><span>' + ICONS.bed + (p.quartos || 0) + ' qts</span><span>' + ICONS.car + (p.vagas || 0) + ' vg</span>';
    return '<div class="prop-card">' +
      '<div class="prop-cover">' + propCoverSvg(p.tipo) + '<span class="tag">' + escapeHtml(p.tipo) + '</span></div>' +
      '<div class="prop-body">' +
      '<h3>' + escapeHtml(p.titulo) + '</h3>' +
      '<div class="prop-addr">' + escapeHtml(p.bairro || "") + ' · ' + escapeHtml(p.cidade || "") + '</div>' +
      '<div class="prop-specs">' + specs + '</div>' +
      '<div class="prop-price">' + fmtBRL(p.preco) + (p.finalidade === "aluguel" ? " /mês" : "") + '</div>' +
      '</div>' +
      '<div class="prop-foot"><button class="btn btn-primary" data-create="' + p.id + '">' + ICONS.wand + ' Criar carrossel</button></div>' +
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
    document.getElementById("add-prop").addEventListener("click", openAddPropertyModal);
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
    return { step: 1, subjectMode: "topic", propertyId: null, topicId: null, customTopic: "", customCategoria: "Dicas", slides: null, templateSlug: "minimalista", dest: "rascunho", customPrompt: "" };
  }
  var wizard = freshWizard();
  function resetWizard() { wizard = freshWizard(); }

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

  function renderTopicGrid() {
    document.getElementById("topic-grid").innerHTML = state.topicos.map(function (t) {
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
    area.innerHTML = subjectSpotlightHtml() + promptBoxHtml() + '<div class="slide-editor" id="slide-editor"></div>' +
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
      '<div class="gen-empty"><div class="wand"><div class="spin" style="border-top-color:var(--accent); border-color:rgba(61,127,255,0.25);"></div></div>' +
      '<p>Gerando texto com IA (Claude)' + (wizard.customPrompt ? " a partir do seu direcionamento" : "") + '…</p></div>';
    try {
      var origem = wizard.subjectMode === "property" ? "imovel" : wizard.subjectMode === "topic" ? "topico" : "custom";
      var dados;
      if (origem === "imovel") dados = findProp(wizard.propertyId);
      else if (origem === "topico") dados = findTopic(wizard.topicId);
      else dados = { assunto: wizard.customTopic.trim(), categoria: wizard.customCategoria };

      var resp = await callFunction("gerar-conteudo", { origem: origem, dados: dados, direcionamento: wizard.customPrompt || undefined });
      wizard.slides = resp.slides || [];
      if (!wizard.slides.length) throw new Error("A IA não retornou slides. Tente gerar de novo.");
      area.querySelector(".gen-empty p").textContent = "Texto pronto. Buscando fotos reais em alta resolução pra cada slide…";
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
    document.getElementById("preview-strip").innerHTML = slideStrip(wizard.slides || [], wizard.templateSlug, false, wizardArt());
  }

  function renderDestStep() {
    var dests = [
      { id: "rascunho", nome: "Salvar rascunho", desc: "Continue editando depois" },
      { id: "agendado", nome: "Agendar", desc: "Escolha data e horário" },
      { id: "publicado", nome: "Publicar agora", desc: (state.igConta && state.igConta.status === "ativo") ? "Envia direto pro Instagram" : "Marca como publicado" }
    ];
    document.getElementById("dest-grid").innerHTML = dests.map(function (d) {
      return '<div class="dest-card ' + (wizard.dest === d.id ? "selected" : "") + '" data-dest="' + d.id + '"><h4>' + d.nome + '</h4><p>' + d.desc + '</p></div>';
    }).join("");
    qsa("[data-dest]").forEach(function (el) {
      el.addEventListener("click", function () { wizard.dest = el.dataset.dest; renderDestStep(); });
    });
    document.getElementById("schedule-box").hidden = wizard.dest !== "agendado";
    if (wizard.dest === "agendado" && !document.getElementById("sched-date").value) {
      document.getElementById("sched-date").value = addDays(2).toISOString().slice(0, 10);
    }
    var igOn = state.igConta && state.igConta.status === "ativo";
    document.getElementById("ig-warn").hidden = !(wizard.dest === "publicado" && !igOn);
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

  async function confirmCarousel() {
    var btn = document.getElementById("wiz-next");
    var origem = wizard.subjectMode === "property" ? "imovel" : wizard.subjectMode === "topic" ? "topico" : "custom";
    var tpl = findTemplateBySlug(wizard.templateSlug);
    var payload = {
      corretor_id: state.profile.id,
      origem: origem,
      template_id: tpl ? tpl.id : null,
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
      payload.data_agendada = new Date(date + "T" + time).toISOString();
    } else if (wizard.dest === "publicado") {
      payload.data_publicada = new Date().toISOString();
    }
    // com Instagram conectado, "Publicar agora" salva como rascunho e publica de verdade;
    // o servidor só marca "publicado" depois que o Instagram confirmar o post.
    var igPublish = wizard.dest === "publicado" && state.igConta && state.igConta.status === "ativo";
    if (igPublish) { payload.status = "rascunho"; delete payload.data_publicada; }

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

      // O débito do crédito de trial já é feito pelo servidor (Edge Function gerar-conteudo) no momento
      // da geração, antes deste passo de salvar — o cliente não tem mais permissão de escrever em
      // trial_usado diretamente, então só busca o valor atualizado pra refletir na tela.
      // (Antes essa linha reescrevia trial_usado aqui de novo, debitando 2 créditos por carrossel — corrigido.)
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
      if (igPublish) {
        var ok = await publishToInstagram(carrossel, btn);
        if (!ok) toast("Carrossel salvo como rascunho — tente publicar de novo pelo painel.");
        resetWizard(); showScreen("painel"); return;
      }
      if (wizard.dest === "rascunho") toast("Rascunho salvo.");
      else if (wizard.dest === "agendado") toast("Agendado para " + fmtDateTime(payload.data_agendada) + ".");
      else toast("Marcado como publicado (conecte o Instagram para envio automático).");

      resetWizard(); showScreen("painel");
    } catch (err) {
      toast("Erro ao salvar carrossel: " + err.message);
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
        '<button class="btn btn-ghost btn-sm" id="ig-toggle">Desconectar</button>')
      :
      ('<div class="l"><div class="ig-icon">' + ICONS.ig + '</div><div><div style="font-weight:700;">Nenhuma conta conectada</div>' +
        '<div style="font-size:12px;color:var(--ink-muted);">Conecte sua conta Profissional do Instagram para publicar os carrosséis direto pela Vitrine</div></div></div>' +
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
          window.location.href = resp.url;
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
      return '<div class="qitem"><div class="thumb">' + slideTile(slide0, tpl && tpl.slug, true) + '</div>' +
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

    document.getElementById("plan-grid").innerHTML =
      '<div class="toggle-period" style="grid-column:1/-1;">' +
      '<button data-period="mensal" class="' + (planPeriod === "mensal" ? "active" : "") + '">Mensal</button>' +
      '<button data-period="anual" class="' + (planPeriod === "anual" ? "active" : "") + '">Anual · 2 meses grátis</button>' +
      '</div>' +
      state.planos.map(function (p) {
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
        window.location.href = resp.url;
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
  }

  async function bootApp() {
    var loading = document.getElementById("loading-shell");
    var authView = document.getElementById("auth-view");
    var appView = document.getElementById("app-view");
    loading.hidden = false; authView.hidden = true; appView.hidden = true;

    var session = Auth.load();
    if (!session) {
      loading.hidden = true;
      authMode = "login";
      authView.hidden = false;
      renderAuthView();
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

      if (!navWired) { wireNav(); navWired = true; }
      updateNavPlanBadge();
      resetWizard();
      showScreen("painel");
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

