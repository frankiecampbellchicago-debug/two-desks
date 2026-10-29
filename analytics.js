/* F&L Studio analytics: our own, cookieless.
   Nothing is saved on the visitor's device. A visit id lives only in this tab's memory (window.name)
   so the pages of one visit link up; it's gone when the tab closes. No IP addresses, no form contents.
   Each page view is one record, re-sent (cumulative) whenever the page is hidden; the dashboard keeps
   the latest copy. Other scripts report steps with window.flTrack(type, value).
   ?notrack on any URL stops counting this browser (for us); ?track turns it back on. */
(function () {
  var EP = "https://script.google.com/macros/s/AKfycbzaH1aZ8sJ_Iek7SeO-n7g7IxlHVet7JAwVDwI_GdaEv5ivdUHXbIHHaadQp-OGm73t6Q/exec";   // the analytics collector (/exec URL); blank = off
  var ua = navigator.userAgent;
  try {
    if (/[?&]notrack\b/.test(location.search)) localStorage.setItem("fl_notrack", "1");
    if (/[?&]track\b/.test(location.search)) localStorage.removeItem("fl_notrack");
    if (localStorage.getItem("fl_notrack")) { window.flTrack = function () {}; return; }
  } catch (e) {}
  if (!EP || navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview/i.test(ua)) {
    window.flTrack = function () {}; window.flVisit = function () { return {}; }; return;
  }

  var here = location.pathname.replace(/\/index\.html$/, "/");
  var now = Date.now(), rnd = function () { return Math.random().toString(36).slice(2, 10); };
  var q = new URLSearchParams(location.search), host = location.hostname.replace(/^www\./, "");
  var ref = document.referrer, refHost = "";
  try { refHost = ref ? new URL(ref).hostname.replace(/^www\./, "") : ""; } catch (e) {}
  var internal = refHost === host;

  // ---- where the visit came from ----------------------------------------------------------
  var SITES = [
    [/(^|\.)google\./, "Google", "search"], [/(^|\.)bing\.com$/, "Bing", "search"], [/duckduckgo\.com$/, "DuckDuckGo", "search"],
    [/(^|\.)yahoo\./, "Yahoo", "search"], [/ecosia\.org$/, "Ecosia", "search"], [/(^|\.)yandex\./, "Yandex", "search"],
    [/baidu\.com$/, "Baidu", "search"], [/brave\.com$/, "Brave Search", "search"],
    [/instagram\.com$/, "Instagram", "social"], [/(^|\.)facebook\.com$|^fb\.me$/, "Facebook", "social"],
    [/^t\.co$|(^|\.)twitter\.com$|^x\.com$/, "X (Twitter)", "social"], [/linkedin\.com$|^lnkd\.in$/, "LinkedIn", "social"],
    [/tiktok\.com$/, "TikTok", "social"], [/youtube\.com$|^youtu\.be$/, "YouTube", "social"], [/pinterest\./, "Pinterest", "social"],
    [/reddit\.com$/, "Reddit", "social"], [/threads\.net$/, "Threads", "social"], [/whatsapp\.com$|^wa\.me$/, "WhatsApp", "social"],
    [/mail\.google\.com$|outlook\.(live|office)\.com$|mail\.yahoo\.com$/, "Email", "email"],
    [/chatgpt\.com$|chat\.openai\.com$|perplexity\.ai$|claude\.ai$|gemini\.google\.com$|copilot\.microsoft\.com$/, "AI assistant", "ai"]
  ];
  function source() {
    var us = q.get("utm_source") || q.get("ref"), um = q.get("utm_medium"), uc = q.get("utm_campaign") || "";
    var extra = q.get("utm_content") || q.get("utm_term") || "";
    if (us) return { s: us, m: (um || (/^qr/i.test(us) ? "qr" : "campaign")).toLowerCase(), c: uc, x: extra };
    if (q.get("gclid") || q.get("gbraid") || q.get("wbraid")) return { s: "Google Ads", m: "paid", c: uc, x: extra };
    if (q.get("msclkid")) return { s: "Microsoft Ads", m: "paid", c: uc, x: extra };
    if (q.get("ttclid")) return { s: "TikTok Ads", m: "paid", c: uc, x: extra };
    if (q.get("li_fat_id")) return { s: "LinkedIn Ads", m: "paid", c: uc, x: extra };
    if (refHost && !internal) {
      for (var i = 0; i < SITES.length; i++) if (SITES[i][0].test(refHost)) return { s: SITES[i][1], m: SITES[i][2], c: "", x: "" };
      return { s: refHost, m: "referral", c: "", x: "" };
    }
    if (q.get("fbclid") || /FBAN|FBAV/.test(ua)) return { s: /Instagram/.test(ua) ? "Instagram" : "Facebook", m: "social", c: "", x: "" };
    if (/Instagram/.test(ua)) return { s: "Instagram", m: "social", c: "", x: "" };
    return { s: "Direct", m: "direct", c: "", x: "" };
  }

  // the visit: carried between our pages in window.name, new after 30 minutes idle or a new campaign
  var V = null;
  try { if (window.name.indexOf("flv:") === 0) V = JSON.parse(window.name.slice(4)); } catch (e) {}
  var tagged = q.get("utm_source") || q.get("ref") || q.get("gclid") || q.get("fbclid");
  if (!V || now - V.t > 30 * 60000 || tagged || (refHost && !internal)) {
    var src = source();
    V = { v: rnd() + rnd(), s: src.s, m: src.m, c: src.c, x: src.x, l: here, n: 0 };
  }
  V.n++; V.t = now;
  var saveVisit = function () { V.t = Date.now(); try { window.name = "flv:" + JSON.stringify(V); } catch (e) {} };
  saveVisit();

  // ---- the device ------------------------------------------------------------------------
  var dev = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobi/.test(ua)) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "Tablet"
    : /Mobi|iPhone|Android/.test(ua) ? "Phone" : "Computer";
  var br = /Instagram/.test(ua) ? "Instagram app" : /FBAN|FBAV/.test(ua) ? "Facebook app" : /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox|FxiOS/.test(ua) ? "Firefox"
    : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Other";
  var os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "iOS" : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "Other";

  // ---- the page view record ---------------------------------------------------------------
  var P = {
    v: V.v, p: rnd() + rnd(), n: V.n, f: 0, path: here, title: document.title.slice(0, 80),
    s: V.s, m: V.m, c: V.c, x: V.x, land: V.l, prev: internal ? (function () { try { return new URL(ref).pathname.replace(/\/index\.html$/, "/"); } catch (e) { return ""; } })() : "",
    lang: document.documentElement.lang || "en", bl: (navigator.language || "").slice(0, 10),
    tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ""), dev: dev, br: br, os: os,
    vw: innerWidth, vh: innerHeight, ld: 0, lcp: 0, cls: 0, eng: 0, sc: 0,
    sec: [], ck: {}, ob: {}, rg: {}, fm: [], ff: "", fe: {}, ev: {}, er: 0, erm: "", cv: 0, ttc: 0
  };
  window.flVisit = function () { return { source: V.s, medium: V.m, campaign: V.c, visit: V.v }; };

  // custom steps from other scripts, e.g. flTrack("form", "submit")
  var formStart = 0;
  window.flTrack = function (type, value) {
    if (type === "form") {
      if (value === "start" && !formStart) formStart = Date.now();
      if (P.fm.indexOf(value) < 0) P.fm.push(value);
      if (value === "submit") { P.cv = 1; if (formStart) P.ttc = Math.round((Date.now() - formStart) / 1000); send(); }
    } else if (type === "error") { P.fe[value] = (P.fe[value] || 0) + 1; }
    else { var k = String(type + (value ? ":" + value : "")).slice(0, 60); P.ev[k] = (P.ev[k] || 0) + 1; }
  };

  // ---- what people do --------------------------------------------------------------------
  var lastAct = Date.now(), act = function () { lastAct = Date.now(); };
  ["scroll", "pointerdown", "keydown", "pointermove", "touchstart"].forEach(function (t) { addEventListener(t, act, { passive: true, capture: true }); });
  // engaged time: seconds the page is visible and someone has done something in the last minute
  setInterval(function () { if (!document.hidden && Date.now() - lastAct < 60000) P.eng++; }, 1000);
  var onScroll = function () {
    var h = document.documentElement.scrollHeight - innerHeight;
    var pct = h > 0 ? Math.min(100, Math.round(scrollY / h * 100)) : 100;
    if (pct > P.sc) P.sc = pct;
  };
  addEventListener("scroll", onScroll, { passive: true });

  // which sections were actually seen (at least 40% of the section, or of the screen)
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var r = e.intersectionRect.height, name = e.target._flName;
        if (r >= Math.min(e.boundingClientRect.height, innerHeight) * 0.4 && P.sec.indexOf(name) < 0) {
          P.sec.push(name);
          if (name === "quote") window.flTrack("form", "view");
        }
      });
    }, { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] });
    document.querySelectorAll("main > header, main > section, [data-track-section]").forEach(function (el) {
      el._flName = el.getAttribute("data-track-section") || el.id || (el.classList.contains("hero") ? "hero" : el.classList.contains("cta") ? "cta" : el.classList[0] || el.tagName.toLowerCase());
      io.observe(el);
    });
  }

  // clicks: what was clicked (by its text), links leaving the site, and rage clicks
  var clicks = [];
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("a,button,[role=button],summary,label") : null;
    var tn = Date.now();
    clicks = clicks.filter(function (c) { return tn - c.t < 800; });
    clicks.push({ t: tn, x: e.clientX, y: e.clientY });
    var near = clicks.filter(function (c) { return Math.abs(c.x - e.clientX) < 40 && Math.abs(c.y - e.clientY) < 40; });
    var label = !t ? "(not a button) " + (e.target.id || e.target.className || e.target.tagName).toString().slice(0, 30)
      : t.getAttribute("data-track") || (t.closest(".cal") ? "Calendar: " + (t.classList.contains("cal-nav") ? "month arrow" : "day") : "")
      || (t.closest(".lang-menu") ? "Language: " + t.textContent.trim() : "")
      || (t.textContent || t.getAttribute("aria-label") || t.getAttribute("href") || "").replace(/\s+/g, " ").trim().slice(0, 40) || t.tagName;
    if (near.length === 3) P.rg[label] = (P.rg[label] || 0) + 1;
    if (!t) return;
    P.ck[label] = (P.ck[label] || 0) + 1;
    var href = t.getAttribute && t.getAttribute("href");
    if (href) {
      if (/^tel:/.test(href)) window.flTrack("contact", "phone");
      else if (/^mailto:/.test(href)) window.flTrack("contact", "email");
      else try { var u = new URL(href, location.href); if (u.hostname.replace(/^www\./, "") !== host) P.ob[u.hostname + u.pathname.replace(/\/$/, "")] = 1; } catch (e2) {}
    }
  }, true);

  // the quote form: first field touched, the last field touched (where people stop), field order
  var form = document.getElementById("qform");
  if (form) {
    form.addEventListener("focusin", function (e) {
      var n = e.target.name || (e.target.id === "daybtn" ? "day" : "");
      if (!n || n === "_honey") return;
      window.flTrack("form", "start"); P.ff = n;
    });
    form.addEventListener("change", function (e) { if (e.target.name && e.target.name !== "_honey") P.ff = e.target.name; });
  }

  // speed and errors
  addEventListener("load", function () {
    setTimeout(function () {
      var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      P.ld = Math.round(nav ? nav.loadEventEnd : performance.now());
    }, 0);
  });
  try {
    new PerformanceObserver(function (l) { var es = l.getEntries(); if (es.length) P.lcp = Math.round(es[es.length - 1].startTime); })
      .observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver(function (l) { l.getEntries().forEach(function (x) { if (!x.hadRecentInput) P.cls = Math.round((P.cls + x.value * 1000)) ; }); })
      .observe({ type: "layout-shift", buffered: true });
  } catch (e) {}
  addEventListener("error", function (e) { P.er++; if (!P.erm) P.erm = String(e.message || "").slice(0, 120); });
  document.addEventListener("langchange", function () { P.lang = document.documentElement.lang || P.lang; });

  // ---- sending: one small beacon whenever the page is hidden (tab switch, close, next page) ----
  var lastSent = "";
  function send() {
    onScroll(); saveVisit();
    var same = JSON.stringify(P).replace(/"f":\d+,/, "");
    if (same === lastSent) return;   // nothing new since the last copy
    lastSent = same;
    P.f++;
    var body = JSON.stringify(P);
    try { navigator.sendBeacon(EP, new Blob([body], { type: "text/plain" })) || fetch(EP, { method: "POST", body: body, mode: "no-cors", keepalive: true }); } catch (e) {}
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) send(); });
  addEventListener("pagehide", send);
  // links to our own pages: remember the visit just before leaving
  document.addEventListener("click", function () { saveVisit(); });
})();
